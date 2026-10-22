// Fakes for the parts of St, Clutter, GLib, PopupMenu, PanelMenu, Meta, Shell and the
// Shell's `Main` and `global` that the extension uses. They keep the real objects'
// bookkeeping (signal ids, parenting, destruction, main-loop sources) so that lifecycle
// tests can prove nothing is left behind after `disable()`.

export class SignalEmitter {
	#handlers = new Map();
	#nextId = 1;

	connect(signal, callback) {
		if (typeof callback !== 'function') {
			throw new TypeError(`connect('${signal}'): callback is not a function`);
		}
		const id = this.#nextId++;
		this.#handlers.set(id, { signal, callback });
		return id;
	}

	disconnect(id) {
		if (!this.#handlers.delete(id)) {
			throw new Error(`No signal handler with id ${id}`);
		}
	}

	/** Calls every handler for `signal`; returns the last handler's return value. */
	emit(signal, ...args) {
		let result;
		for (const handler of [...this.#handlers.values()]) {
			if (handler.signal === signal) {
				result = handler.callback(this, ...args);
			}
		}
		return result;
	}

	get connectionCount() {
		return this.#handlers.size;
	}

	connectedSignals() {
		return [...this.#handlers.values()].map((h) => h.signal);
	}
}

export class Actor extends SignalEmitter {
	/** Every actor created since the last reset, so tests can prove that none outlives `disable()`. */
	static registry = [];

	constructor(props = {}) {
		super();
		Actor.registry.push(this);
		this.visible = true;
		this.reactive = false;
		this.can_focus = false;
		this.track_hover = false;
		this.hover = false;
		this.style = '';
		this.style_class = '';
		this.children = [];
		this.parent = null;
		this.destroyed = false;
		Object.assign(this, props);
	}

	#assertAlive(what) {
		if (this.destroyed) {
			throw new Error(`${what}: ${this.constructor.name} has been destroyed`);
		}
	}

	add_child(child) {
		this.#assertAlive('add_child');
		// Clutter refuses an actor that already has a parent (it logs a critical).
		if (child.parent) {
			throw new Error('add_child: the actor already has a parent');
		}
		child.parent = this;
		this.children.push(child);
	}

	remove_child(child) {
		const i = this.children.indexOf(child);
		if (i === -1) {
			throw new Error('remove_child: not a child of this actor');
		}
		this.children.splice(i, 1);
		child.parent = null;
	}

	set_can_focus(value) {
		this.can_focus = value;
	}

	set_track_hover(value) {
		this.track_hover = value;
	}

	destroy() {
		if (this.destroyed) {
			return;
		}
		for (const child of [...this.children]) {
			child.destroy();
		}
		this.parent?.remove_child(this);
		this.destroyed = true;
		this.emit('destroy');
	}

	/** Every actor in this subtree, including this one. */
	descendants() {
		return [this, ...this.children.flatMap((c) => c.descendants())];
	}
}

export class BoxLayout extends Actor {}

export class Icon extends Actor {}

export class Label extends Actor {
	constructor(props = {}) {
		super({ text: '', ...props });
	}
}

export class Button extends Actor {
	constructor(props = {}) {
		super({ label: '', checked: false, toggle_mode: false, child: null, ...props });
		// As in St.Bin, the child becomes a real child actor, destroyed with its button.
		if (this.child) {
			this.add_child(this.child);
		}
	}

	set_checked(value) {
		this.checked = value;
	}

	/** What a real click does: toggle if in toggle mode, then emit 'clicked'. */
	click() {
		if (this.toggle_mode) {
			this.checked = !this.checked;
		}
		this.emit('clicked', 1);
	}

	setHover(value) {
		this.hover = value;
		this.emit('notify::hover');
	}
}

export class ClutterText extends SignalEmitter {
	constructor() {
		super();
		this.text = '';
	}

	get_text() {
		return this.text;
	}

	set_text(value) {
		if (value !== this.text) {
			this.text = value;
			this.emit('text-changed');
		}
	}
}

export class Entry extends Actor {
	constructor(props = {}) {
		const { hint_text, ...rest } = props;
		super(rest);
		this.hint_text = hint_text;
		this.clutter_text = new ClutterText();
	}

	get_clutter_text() {
		return this.clutter_text;
	}

	get_text() {
		return this.clutter_text.get_text();
	}

	set_text(value) {
		this.clutter_text.set_text(value);
	}
}

export class Clipboard {
	static #instance = new Clipboard();

	static get_default() {
		return Clipboard.#instance;
	}

	constructor() {
		this.reset();
	}

	reset() {
		/** Selection buffers by St.ClipboardType: 0 = PRIMARY (middle click), 1 = CLIPBOARD (Ctrl+V). */
		this.buffers = { 0: null, 1: null };
		this.pending = [];
		this.reads = [];
		this.writes = [];
	}

	/** The Ctrl+V buffer, which is what users care about. */
	get contents() {
		return this.buffers[1];
	}

	set contents(text) {
		this.buffers[1] = text;
	}

	set_text(type, text) {
		if (!(type in this.buffers)) {
			throw new TypeError(`Clipboard.set_text: unknown selection type ${type}`);
		}
		if (typeof text !== 'string') {
			throw new TypeError(`Clipboard.set_text: expected a string, got ${typeof text}`);
		}
		this.writes.push({ type, text });
		this.buffers[type] = text;
	}

	/** Asynchronous in the real API: the callback runs on `flush()`, with what was there when asked. */
	get_text(type, callback) {
		if (!(type in this.buffers)) {
			throw new TypeError(`Clipboard.get_text: unknown selection type ${type}`);
		}
		this.reads.push({ type });
		const snapshot = this.buffers[type];
		this.pending.push(() => callback(this, snapshot));
	}

	flush() {
		const pending = this.pending;
		this.pending = [];
		pending.forEach((run) => run());
	}
}

// ---- GLib main loop -------------------------------------------------------------------

export function createGLib() {
	const sources = new Map();
	let nextId = 1;
	const glib = {
		PRIORITY_DEFAULT: 0,
		/** As GLib escapes text for Pango markup. */
		// (`length` is in bytes, -1 meaning all of the text; characters are close enough here.)
		markup_escape_text: (text, length) =>
			(length < 0 ? text : text.slice(0, length))
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.replaceAll("'", '&apos;')
				.replaceAll('"', '&quot;'),
		SOURCE_REMOVE: false,
		SOURCE_CONTINUE: true,
		timeout_add(priority, interval, callback) {
			const id = nextId++;
			sources.set(id, { priority, interval, callback });
			return id;
		},
		Source: {
			// Verified in GJS: a string id is a TypeError; null, 0 or an unknown id only make
			// GLib log a critical and return false.
			remove(id) {
				if (typeof id === 'string') {
					throw new TypeError(`GLib.Source.remove: expected a source id, got "${id}"`);
				}
				const known = sources.delete(id);
				if (!known) {
					glib.criticals++;
				}
				return known;
			},
		},
		criticals: 0,
		/** Test control: forget every source, as a fresh Shell would have none. */
		reset() {
			sources.clear();
			nextId = 1;
			glib.criticals = 0;
		},
		/** Test control: run (and, unless they ask to continue, remove) every pending timeout. */
		runTimeouts() {
			for (const [id, source] of [...sources]) {
				// GJS converts a callback that returns nothing to false, which removes the source.
				if (sources.has(id) && source.callback() !== true) {
					sources.delete(id);
				}
			}
		},
		get activeSources() {
			return sources.size;
		},
		pendingIntervals() {
			return [...sources.values()].map((s) => s.interval);
		},
	};
	return glib;
}

// ---- Popup menus and the panel --------------------------------------------------------

export class PopupBaseMenuItem extends Actor {
	constructor(params = {}) {
		const { style_class, reactive, can_focus } = params;
		super({ style_class: style_class ?? '', reactive: reactive ?? true, can_focus: can_focus ?? true });
	}

	get actor() {
		return this;
	}
}

export class PopupMenuBase extends SignalEmitter {
	constructor() {
		super();
		this.items = [];
		this.isOpen = false;
	}

	addMenuItem(item) {
		this.items.push(item);
		this.box.add_child(item);
	}

	_getMenuItems() {
		return [...this.items];
	}

	removeAll() {
		this.items.splice(0).forEach((item) => item.destroy());
	}

	toggle() {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}

	open() {
		this.isOpen = true;
		this.emit('open-state-changed', true);
	}

	close() {
		if (this.isOpen) {
			this.isOpen = false;
			this.emit('open-state-changed', false);
		}
	}

	// Shell's PopupMenuBase.destroy() closes the menu first, which emits 'open-state-changed'.
	destroy() {
		this.close();
		this.removeAll();
	}
}

export class PopupSubMenu extends PopupMenuBase {
	constructor() {
		super();
		this.box = new Actor();
	}
}

export class PopupSubMenuMenuItem extends PopupBaseMenuItem {
	constructor(text) {
		super({ reactive: true, can_focus: true });
		this.label = new Label({ text });
		this._triangleBin = new Actor();
		this.menu = new PopupSubMenu();
		this.add_child(this.label);
		this.add_child(this._triangleBin);
		this.add_child(this.menu.box);
	}

	/** As in the Shell, showing the submenu opens its menu. */
	setSubmenuShown(open) {
		if (open) {
			this.menu.open();
		} else {
			this.menu.close();
		}
	}

	_getOpenState() {
		return this.menu.isOpen;
	}
}

export class PanelMenuButton extends Actor {
	constructor(menuAlignment, nameText, dontCreateMenu) {
		super({ reactive: true });
		this.nameText = nameText;
		this.menuAlignment = menuAlignment;
		this.menu = dontCreateMenu ? null : new PanelPopupMenu();
		if (this.menu) {
			this.menu.box = this;
		}
	}

	destroy() {
		this.menu?.destroy();
		super.destroy();
	}
}

class PanelPopupMenu extends PopupMenuBase {}

// ---- Shell globals --------------------------------------------------------------------

export function createMain() {
	const statusArea = new Map();
	const keybindings = new Map();
	return {
		panel: {
			statusArea,
			addToStatusArea(role, indicator, position, box) {
				if (statusArea.has(role)) {
					throw new Error(`Extension point conflict: there is already a status indicator for role ${role}`);
				}
				statusArea.set(role, { indicator, position, box });
				indicator.connect('destroy', () => statusArea.delete(role));
			},
		},
		wm: {
			keybindings,
			addKeybinding(name, settings, flags, modes, handler) {
				if (keybindings.has(name)) {
					throw new Error(`Keybinding '${name}' is already registered`);
				}
				keybindings.set(name, { settings, flags, modes, handler });
				// As in the Shell: the id of the action, which is Meta.KeyBindingAction.NONE (0) if refused.
				return keybindings.size;
			},
			removeKeybinding(name) {
				return keybindings.delete(name);
			},
		},
	};
}

export function createGlobal() {
	return {
		stage: {
			keyFocus: null,
			set_key_focus(actor) {
				this.keyFocus = actor;
			},
		},
		pointer: [0, 0, 0],
		get_pointer() {
			return this.pointer;
		},
	};
}

export const Clutter = {
	ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
	KEY_Return: 0xff0d,
	KEY_KP_Enter: 0xff8d,
	ModifierType: { SHIFT_MASK: 1 << 0, CONTROL_MASK: 1 << 2 },
	EVENT_PROPAGATE: false,
	EVENT_STOP: true,
};

export class KeyEvent {
	constructor(symbol, state = 0) {
		this.symbol = symbol;
		this.state = state;
	}

	get_state() {
		return this.state;
	}

	get_key_symbol() {
		return this.symbol;
	}
}

export class ButtonEvent {
	constructor(button) {
		this.button = button;
	}

	get_button() {
		return this.button;
	}
}
