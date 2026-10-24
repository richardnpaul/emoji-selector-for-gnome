// Only installed by tests/integration/shell.real.test.js, into a throw-away profile.
//
// Runs inside the real GNOME Shell, next to Emoji Selector. When Emoji Selector is enabled or disabled
// (by the test, over D-Bus) it looks at what the Shell now holds, drives the extension with a virtual
// pointer and keyboard like a user would, and reports with lines starting with "DRIVER " in the log.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// (The test says which extension to drive, in the environment of the Shell.)
const UNDER_TEST = GLib.getenv('UNDER_TEST');
// The states of an extension in the Shell (js/ui/extensionSystem.js).
const ACTIVE = 1;
const INACTIVE = 2;
const DEACTIVATING = 7;
const ACTIVATING = 8;

/** The settings of the extension under test, which live in the same process as the Shell. */
function settingsOfExtension() {
	const { path, metadata } = Main.extensionManager.lookup(UNDER_TEST);
	const source = Gio.SettingsSchemaSource.new_from_directory(
		`${path}/schemas`,
		Gio.SettingsSchemaSource.get_default(),
		false,
	);
	return new Gio.Settings({ settings_schema: source.lookup(metadata['settings-schema'], true) });
}
const say = (name, value) => console.log(`DRIVER ${JSON.stringify({ name, value })}`);
const sleep = (ms) =>
	new Promise((resolve) => {
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			resolve();
			return GLib.SOURCE_REMOVE;
		});
	});

function* descendants(actor) {
	for (const child of actor.get_children()) {
		yield child;
		yield* descendants(child);
	}
}
const find = (root, predicate) => [...descendants(root)].filter(predicate);
const styled = (name) => (actor) => (actor.style_class ?? '').split(' ').includes(name);
const clipboardText = () =>
	new Promise((resolve) => {
		St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => resolve(text));
	});

export default class Driver extends Extension {
	#round = 0;
	#handler = null;
	#pointer = null;
	#keyboard = null;
	#queue = Promise.resolve();

	enable() {
		const seat = global.stage.context.get_backend().get_default_seat();
		this.#pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
		this.#keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
		let previous = null;
		this.#handler = Main.extensionManager.connect('extension-state-changed', (_manager, extension) => {
			if (extension.uuid !== UNDER_TEST) {
				return;
			}
			const { state } = extension;
			// (The Shell also announces ACTIVE again when it starts to disable an extension.)
			const activated = state === ACTIVE && previous === ACTIVATING;
			const deactivated = state === INACTIVE && previous === DEACTIVATING;
			previous = state;
			if (!activated && !deactivated) {
				return;
			}
			// One report at a time, in order, whatever the test does meanwhile.
			this.#queue = this.#queue
				.then(() => (activated ? this.#enabled() : this.#disabled()))
				.catch((error) => {
					say('driver-error', String(error?.stack ?? error));
				});
		});
		St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, 'probe');
		clipboardText().then((text) => say('clipboard-probe', text));
		say('ready', true);
	}

	disable() {
		Main.extensionManager.disconnect(this.#handler);
		this.#handler = null;
		this.#pointer = null;
		this.#keyboard = null;
	}

	async #click(actor, button = Clutter.BUTTON_PRIMARY) {
		const [x, y] = actor.get_transformed_position();
		const [width, height] = actor.get_transformed_size();
		// (The first motion of a new virtual pointer only gets it part of the way, so move twice.)
		for (let move = 0; move < 2; move++) {
			this.#pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width / 2, y + height / 2);
			await sleep(80);
		}
		this.#pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.PRESSED);
		this.#pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.RELEASED);
		await sleep(150);
	}

	/** Types `keys` into `entry` until it holds `text` (the virtual keyboard now and then loses a key). */
	async #type(entry, text, keys) {
		for (let attempt = 0; attempt < 3 && entry.get_text() !== text; attempt++) {
			entry.set_text('');
			for (const key of keys) {
				this.#keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.PRESSED);
				this.#keyboard.notify_keyval(GLib.get_monotonic_time(), key, Clutter.KeyState.RELEASED);
				await sleep(40);
			}
			await sleep(100);
		}
	}

	/** Presses Super+period, the extension's default shortcut. */
	async #shortcut() {
		const now = () => GLib.get_monotonic_time();
		this.#keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
		this.#keyboard.notify_keyval(now(), Clutter.KEY_period, Clutter.KeyState.PRESSED);
		this.#keyboard.notify_keyval(now(), Clutter.KEY_period, Clutter.KeyState.RELEASED);
		this.#keyboard.notify_keyval(now(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
		await sleep(400);
	}

	/**
	 * Presses the shortcut until `done()`, at most four times: the virtual keyboard now and then loses
	 * a key, but a shortcut that does not work never gets there. Returns how many presses it took.
	 */
	async #shortcutUntil(done) {
		for (let presses = 1; presses <= 4; presses++) {
			await this.#shortcut();
			if (done()) {
				return presses;
			}
		}
		return Infinity;
	}

	#inspect() {
		const indicator = Main.panel.statusArea[UNDER_TEST];
		if (!indicator) {
			return { present: false };
		}
		const items = indicator.menu._getMenuItems();
		return {
			present: true,
			visible: indicator.visible,
			menuItems: items.length,
			menuOpen: indicator.menu.isOpen,
		};
	}

	/** The emoji buttons that are on screen: the recently used row first. */
	#emojiButtons(indicator) {
		return find(indicator.menu.box, styled('EmojisItemStyle'));
	}

	/** The texts the extension shows, in the language of the Shell: what its actors say about themselves. */
	#texts(indicator) {
		const box = indicator.menu.box;
		const names = (style) => find(box, styled(style)).map((actor) => actor.accessible_name);
		const [entry] = find(box, (actor) => actor.name === 'searchEntry');
		return {
			panelName: indicator.accessible_name,
			hint: entry.hint_text,
			categories: names('EmojisCategory'),
			// (Three categories have a tone bar, the first of them comes first; two have genders.)
			tones: names('EmojisTone').slice(0, 6),
			genders: names('EmojisGender').slice(0, 2),
		};
	}

	/**
	 * Types `word` in the search and reports what it finds once the results stop changing: the names of the emojis in the
	 * user's language load in the background, and the search shows them when they arrive.
	 */
	async #search(indicator, word) {
		// (The first keys of a new virtual keyboard are lost, so start with a harmless one.)
		this.#keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
		this.#keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
		await sleep(200);
		indicator.menu.open();
		await sleep(400);
		const entry = find(indicator.menu.box, (actor) => actor.name === 'searchEntry')[0];
		// (The keysym of a letter of the alphabet is its code.)
		const keys = [...word].map((letter) => letter.codePointAt(0));
		await this.#type(entry, word, keys);
		let results = this.#emojiButtons(indicator).map((button) => button.label);
		for (let steady = 0, poll = 0; steady < 2 && poll < 20; poll++) {
			await sleep(300);
			const now = this.#emojiButtons(indicator).map((button) => button.label);
			steady = now.join() === results.join() ? steady + 1 : 0;
			results = now;
		}
		say('searched', { text: entry.get_text(), results });
	}

	async #enabled() {
		const round = ++this.#round;
		const indicator = Main.panel.statusArea[UNDER_TEST];
		say('enabled', { round, ...this.#inspect() });
		if (round === 1) {
			say('texts', this.#texts(indicator));
			if (GLib.getenv('DRIVER_MODE') === 'texts') {
				return;
			}
			if (GLib.getenv('DRIVER_MODE') === 'search') {
				await this.#search(indicator, GLib.getenv('DRIVER_QUERY'));
				return;
			}
		}
		if (round !== 1) {
			// Leave the menu open: the extension is disabled next, as when the screen locks. (The panel
			// lays its new button out first: a menu opened at once has no position to open at.)
			await sleep(300);
			indicator.menu.open();
			await sleep(300);
			say('left-open', { menuOpen: indicator.menu.isOpen });
			return;
		}

		// (The first keys of a new virtual keyboard are lost, so start with a harmless one.)
		this.#keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
		this.#keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
		await sleep(200);

		// The shortcut opens and closes the menu.
		const toOpen = await this.#shortcutUntil(() => indicator.menu.isOpen);
		const opened = indicator.menu.isOpen;
		const toClose = await this.#shortcutUntil(() => !indicator.menu.isOpen);
		say('shortcut', {
			opened,
			closed: !indicator.menu.isOpen,
			attempts: [toOpen, toClose].map((count) => (count <= 4 ? 'ok' : 'never')),
		});

		// Opening the menu gives the search entry the keyboard focus (a moment later).
		indicator.menu.open();
		await sleep(400);
		const entry = find(indicator.menu.box, (actor) => actor.name === 'searchEntry')[0];
		say('opened', {
			menuOpen: indicator.menu.isOpen,
			entryFocused: global.stage.key_focus === entry.clutter_text || global.stage.key_focus === entry,
			recents: this.#emojiButtons(indicator).map((button) => button.label),
		});

		// Typing searches.
		await this.#type(entry, 'cat', [Clutter.KEY_c, Clutter.KEY_a, Clutter.KEY_t]);
		const results = this.#emojiButtons(indicator).map((button) => button.label);
		say('typed', { text: entry.get_text(), results });

		// Clicking the first result copies it and closes the menu.
		await this.#click(this.#emojiButtons(indicator)[0]);
		say('clicked', {
			clipboard: await clipboardText(),
			menuOpen: indicator.menu.isOpen,
			recentlyUsed: settingsOfExtension().get_strv('recently-used').slice(0, 3),
		});

		// Open again: a clean start, then a category from its button.
		indicator.menu.open();
		await sleep(400);
		const categoryButtons = find(indicator.menu.box, styled('EmojisCategory'));
		await this.#click(categoryButtons[0]);
		const rows = find(indicator.menu.box, styled('EmojisList'));
		say('category', {
			entryText: entry.get_text(),
			buttons: categoryButtons.length,
			checked: categoryButtons[0].checked,
			rows: rows.length,
			emojis: find(indicator.menu.box, styled('EmojisItemStyle')).length,
		});
		await this.#click(categoryButtons[0]);
		say('category-closed', { checked: categoryButtons[0].checked });
		indicator.menu.close();
		await sleep(100);
		say('closed', this.#inspect());

		// The settings change the menu while it runs.
		const settings = settingsOfExtension();
		settings.set_int('emojisize', 44);
		say('resized', { styles: [...new Set(this.#emojiButtons(indicator).map((button) => button.style))] });
		settings.set_boolean('always-show', false);
		say('always-show', { visible: indicator.visible });
		settings.set_boolean('always-show', true);
		let oldIsGone = false;
		indicator.connect('destroy', () => {
			oldIsGone = true;
		});
		settings.set_int('nbcols', 12);
		settings.set_string('position', 'bottom');
		await sleep(200);
		const rebuilt = Main.panel.statusArea[UNDER_TEST];
		say('rebuilt', {
			replaced: rebuilt !== indicator,
			oldIsGone,
			oneIndicator: Object.keys(Main.panel.statusArea).filter((role) => role === UNDER_TEST).length,
			recents: this.#emojiButtons(rebuilt).length,
			lastItemIsHeader: find(rebuilt.menu._getMenuItems().at(-1), styled('EmojisCategory')).length === 9,
		});
		settings.set_boolean('use-keybinding', false);
		// Without the shortcut nothing opens the menu, however often it is pressed...
		let openedWithout = false;
		for (let presses = 0; presses < 3; presses++) {
			await this.#shortcut();
			openedWithout ||= rebuilt.menu.isOpen;
		}
		say('shortcut-off', { menuOpen: openedWithout });
		// (...and the Shell takes Super for itself and opens the overview.)
		Main.overview.hide();
		await sleep(800);
		settings.set_boolean('use-keybinding', true);
		await this.#shortcutUntil(() => rebuilt.menu.isOpen);
		say('shortcut-on-again', { menuOpen: rebuilt.menu.isOpen });
		rebuilt.menu.close();
		settings.reset('nbcols');
		settings.reset('position');
		settings.reset('emojisize');
	}

	async #disabled() {
		const leftovers = find(
			Main.uiGroup,
			(actor) => styled('EmojisItemStyle')(actor) || styled('EmojisCategory')(actor) || actor.name === 'searchEntry',
		);
		say('disabled', { ...this.#inspect(), leftovers: leftovers.length });
		if (this.#round === 2) {
			// With the extension gone, its shortcut does nothing (the Shell takes Super for itself).
			await this.#shortcut();
			say('shortcut-after-disable', this.#inspect());
			Main.overview.hide();
		}
	}
}
