// Fakes for the parts of Gtk 4 and libadwaita that the preferences use. Like the Shell toolkit
// fakes they keep the real objects' bookkeeping (notify signals only on change, parenting,
// destruction) so that tests of the preferences are about behaviour. tests/integration/prefs
// runs the same preferences on the real libraries.
import { SignalEmitter } from './toolkit.js';

/** Defines GObject-style properties: assigning a different value emits `notify::<name>`. */
function notifying(Class, names) {
	for (const name of names) {
		Object.defineProperty(Class.prototype, name, {
			get() {
				return this._props.get(name);
			},
			set(value) {
				if (!Object.is(this._props.get(name), value)) {
					this._props.set(name, value);
					this.emit(`notify::${name}`);
				}
			},
		});
	}
}

export class Widget extends SignalEmitter {
	destroyed = false;

	constructor(props = {}) {
		super();
		this._props = new Map(Object.entries({ sensitive: true, ...props }));
		this.children = [];
		this.cssClasses = new Set();
	}

	add_css_class(name) {
		this.cssClasses.add(name);
	}

	remove_css_class(name) {
		this.cssClasses.delete(name);
	}

	has_css_class(name) {
		return this.cssClasses.has(name);
	}

	destroy() {
		if (this.destroyed) {
			return;
		}
		this.children.forEach((child) => child.destroy());
		this.destroyed = true;
		this.emit('destroy');
	}
}
notifying(Widget, ['sensitive', 'title', 'subtitle', 'text']);

export class Image extends Widget {}
notifying(Image, ['icon_name']);

export class Adjustment extends Widget {
	constructor({ lower = 0, upper = 0, step_increment = 0, page_increment = 0, value = lower } = {}) {
		super({ lower, upper, step_increment, page_increment, value });
	}
}
notifying(Adjustment, ['lower', 'upper', 'step_increment', 'page_increment', 'value']);

export class StringList extends Widget {
	static new(strings) {
		return new StringList({ strings });
	}
}
notifying(StringList, ['strings']);

export class PreferencesGroup extends Widget {
	add(row) {
		this.children.push(row);
	}
}
notifying(PreferencesGroup, ['description']);

export class PreferencesPage extends Widget {
	add(group) {
		this.children.push(group);
	}
}
notifying(PreferencesPage, ['icon_name']);

export class PreferencesWindow extends Widget {
	add(page) {
		this.children.push(page);
	}

	get_display() {
		return { get_app_launch_context: () => ({ launchContext: true }) };
	}
}

export class ActionRow extends Widget {
	add_suffix(widget) {
		this.children.push(widget);
	}
}
notifying(ActionRow, ['activatable']);

export class SwitchRow extends ActionRow {
	constructor(props = {}) {
		super({ active: false, ...props });
	}
}
notifying(SwitchRow, ['active']);

export class SpinRow extends ActionRow {
	constructor({ adjustment, ...props } = {}) {
		super({ adjustment, value: adjustment?.lower ?? 0, ...props });
	}

	// As in libadwaita, the value lives in the adjustment, which keeps it between its bounds.
	get value() {
		return this._props.get('value');
	}

	set value(requested) {
		const { lower, upper } = this._props.get('adjustment');
		const value = Math.min(upper, Math.max(lower, Math.round(requested)));
		if (this._props.get('value') !== value) {
			this._props.set('value', value);
			this.emit('notify::value');
		}
	}
}

notifying(SpinRow, ['adjustment']);

export class ComboRow extends ActionRow {
	constructor(props = {}) {
		super({ selected: 0, ...props });
	}
}
notifying(ComboRow, ['selected', 'model']);

export class EntryRow extends Widget {
	constructor(props = {}) {
		super({ text: '', show_apply_button: false, ...props });
	}
}
notifying(EntryRow, ['show_apply_button']);

/**
 * What `Gtk.accelerator_parse` accepts: optional <Modifier>s, then an optional key name (GTK parses
 * `<Super>` alone as valid, with the key 0).
 */
export function accelerator_parse(text) {
	const valid = /^(<[A-Za-z]+>)*([A-Za-z0-9][A-Za-z0-9_]*)?$/.test(text) && text !== '';
	const hasKey = /(^|>)[A-Za-z0-9][A-Za-z0-9_]*$/.test(text);
	return [valid, valid && hasKey ? 1 : 0, 0];
}
