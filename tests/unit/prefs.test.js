import { beforeEach, describe, expect, it, vi } from 'vitest';
import Adw from 'gi://Adw';
import { launcher } from '../support/gi/Gio.js';
import path from 'node:path';

import EmojiSelectorPreferences from '../../src/prefs.ts';
import { EXTENSION_DIR, METADATA } from '../support/paths.js';
import { parseSchema } from '../support/fakes/settings.js';
import { extensionState } from '../support/shell-state.js';
import { createSettings } from '../support/settings.js';

const SCHEMA = parseSchema(path.join(EXTENSION_DIR, `schemas/${METADATA['settings-schema']}.gschema.xml`));
const URL = 'https://example.org/emoji-selector';

describe('the preferences window', () => {
	let raw;
	let settings;
	let window;

	async function open(metadata = { uuid: METADATA.uuid, url: URL }) {
		window = new Adw.PreferencesWindow();
		await new EmojiSelectorPreferences(metadata).fillPreferencesWindow(window);
		return window;
	}

	const [LAYOUT, SHORTCUT, ABOUT] = [0, 1, 2];
	const page = (index) => window.children[index];
	const groups = (index) => page(index).children;
	const rows = (index, group = 0) => groups(index)[group].children;
	const row = (index, title, group) => rows(index, group).find((candidate) => candidate.title === title);

	beforeEach(async () => {
		extensionState.translate = (text) => `«${text}»`;
		({ raw, settings } = createSettings());
		extensionState.settings = raw;
		await open();
	});

	it('has the pages Layout, Keyboard bindings and About, in this order', () => {
		expect(window.children.map((child) => child.title)).toEqual(['«Layout»', '«Keyboard bindings»', '«About»']);
		expect(window.children.map((child) => child.icon_name)).toEqual([
			'view-grid-symbolic',
			'input-keyboard-symbolic',
			'help-about-symbolic',
		]);
	});

	it('shows its texts as they are, without reading them as markup', () => {
		const allRows = window.children.flatMap((child) => child.children.flatMap((group) => group.children));
		const textRows = allRows.filter((candidate) => candidate.title !== undefined);
		expect(textRows.length).toBeGreaterThan(10);
		expect(textRows.filter((candidate) => candidate._props.get('use_markup') !== false)).toEqual([]);
	});

	describe('Layout', () => {
		const position = () => row(LAYOUT, '«General layout»');

		it('offers the two positions, explaining which suits a bottom panel', () => {
			expect(position().model.strings).toEqual(['«From top to bottom»', '«From bottom to top»']);
			expect(position().subtitle).toBe(
				'«Displaying the interface from the bottom is better if you use a bottom panel instead of the default top bar.»',
			);
		});

		it('shows the position that is set', async () => {
			expect(position().selected).toBe(0);
			raw.set_string('position', 'bottom');
			await open();
			expect(position().selected).toBe(1);
		});

		it('sets the position that is chosen', () => {
			position().selected = 1;
			expect(settings.position).toBe('bottom');
			position().selected = 0;
			expect(settings.position).toBe('top');
		});

		it('goes back to the stored position, and says so, when the setting is locked', () => {
			raw.lock('position');
			position().selected = 1;
			expect(position().selected).toBe(0);
			expect(settings.position).toBe('top');
			expect(window.toasts.map((toast) => [toast.title, toast.use_markup])).toEqual([
				['«The setting could not be saved»', false],
			]);
		});

		it('says nothing when the chosen position is the stored one', () => {
			position().selected = 0;
			expect(window.toasts).toEqual([]);
		});

		it('follows the setting when it changes elsewhere', () => {
			raw.set_string('position', 'bottom');
			expect(position().selected).toBe(1);
			raw.set_string('position', 'top');
			expect(position().selected).toBe(0);
		});

		it('shows the first position for a value it does not know', () => {
			raw.set_string('position', 'sideways');
			expect(position().selected).toBe(0);
		});

		it('does not write a position it was not given', () => {
			raw.set_string('position', 'bottom');
			position().selected = 5;
			expect(settings.position).toBe('bottom');
		});

		it.each([
			['«Number of emojis per line»', 'nbcols', 12],
			['«Size of emojis (px)»', 'emojisize', 18],
		])('binds the row %s to the setting %s', (title, key, value) => {
			const spin = row(LAYOUT, title);
			expect(spin.value).toBe(raw.get_int(key));
			spin.value = value;
			expect(raw.get_int(key)).toBe(value);
			raw.set_int(key, value + 1);
			expect(spin.value).toBe(value + 1);
		});

		it.each([
			['«Number of emojis per line»', 'nbcols'],
			['«Size of emojis (px)»', 'emojisize'],
		])('limits the row %s to the range of the schema', (title, key) => {
			const { range } = SCHEMA.keys.get(key);
			const { adjustment } = row(LAYOUT, title);
			expect([adjustment.lower, adjustment.upper]).toEqual([range.min, range.max]);
			expect([adjustment.step_increment, adjustment.page_increment]).toEqual([1, 10]);
		});
	});

	describe('Keyboard bindings', () => {
		const useShortcut = () => row(SHORTCUT, '«Use a keyboard shortcut to toggle the menu»');
		const entry = () => row(SHORTCUT, '«Keyboard shortcut»');
		const alwaysShow = () => row(SHORTCUT, '«Always show the icon in the panel»', 1);

		it('explains how to write a shortcut, and what the default is, escaped for markup', () => {
			expect(groups(SHORTCUT)[0].description).toBe(
				[
					'«Modifier keys must be between chevrons»',
					'«The default value is &lt;Super&gt;period»',
					'«Don&apos;t use a keyboard shortcut that already exists.»',
				].join('\n'),
			);
		});

		it('binds the switch to "use a keyboard shortcut"', () => {
			expect(useShortcut().active).toBe(true);
			useShortcut().active = false;
			expect(settings.useKeybinding).toBe(false);
			raw.set_boolean('use-keybinding', true);
			expect(useShortcut().active).toBe(true);
		});

		it('binds the switch to "always show the icon", explaining when it is not needed', () => {
			expect(alwaysShow().subtitle).toBe(
				"«If you access the menu with the keyboard shortcut, you don't need to always display the icon.»",
			);
			alwaysShow().active = false;
			expect(settings.alwaysShow).toBe(false);
			raw.set_boolean('always-show', true);
			expect(alwaysShow().active).toBe(true);
		});

		describe('the shortcut entry', () => {
			it('shows the current shortcut, and an empty entry when there is none', async () => {
				expect(entry().text).toBe('<Super>period');
				expect(entry().show_apply_button).toBe(true);
				raw.set_strv('emoji-keybinding', []);
				await open();
				expect(entry().text).toBe('');
			});

			it('stores a valid shortcut when applied', () => {
				entry().text = '<Control><Alt>e';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Control><Alt>e']);
				expect(entry().has_css_class('error')).toBe(false);
			});

			it('ignores the spaces around a shortcut', () => {
				entry().text = '  <Super>e ';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Super>e']);
			});

			it('refuses an invalid shortcut, and says so, until a valid one is applied', () => {
				entry().text = 'not a shortcut';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Super>period']);
				expect(entry().has_css_class('error')).toBe(true);
				entry().text = '<Super>e';
				entry().emit('apply');
				expect(entry().has_css_class('error')).toBe(false);
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Super>e']);
			});

			it('tells why with a message, not only with the red outline, when it refuses a shortcut', () => {
				entry().text = 'not a shortcut';
				entry().emit('apply');
				expect(window.toasts.map((toast) => [toast.title, toast.use_markup])).toEqual([
					['«This is not a valid keyboard shortcut»', false],
				]);
			});

			it('shows no message for a shortcut that is fine, or cleared', () => {
				entry().text = '<Super>e';
				entry().emit('apply');
				entry().text = '';
				entry().emit('apply');
				expect(window.toasts).toEqual([]);
			});

			it('refuses modifiers without a key', () => {
				entry().text = '<Super>';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Super>period']);
				expect(entry().has_css_class('error')).toBe(true);
			});

			it('shows the stored shortcut again, and says so, when the setting is locked', () => {
				raw.lock('emoji-keybinding');
				entry().text = '<Super>e';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual(['<Super>period']);
				expect(entry().text).toBe('<Super>period');
				expect(window.toasts.map((toast) => toast.title)).toEqual(['«The setting could not be saved»']);
			});

			it('shows an empty entry when the locked setting holds no shortcut', () => {
				raw.set_strv('emoji-keybinding', []);
				raw.lock('emoji-keybinding');
				entry().text = '<Super>e';
				entry().emit('apply');
				expect(entry().text).toBe('');
			});

			it('stores no shortcut at all when applied empty', () => {
				entry().text = '';
				entry().emit('apply');
				expect(raw.get_strv('emoji-keybinding')).toEqual([]);
				expect(entry().has_css_class('error')).toBe(false);
			});

			it('follows the setting when it changes elsewhere', () => {
				raw.set_strv('emoji-keybinding', ['<Super>x']);
				expect(entry().text).toBe('<Super>x');
				raw.set_strv('emoji-keybinding', []);
				expect(entry().text).toBe('');
			});
		});

		describe('without a shortcut', () => {
			it('the entry and "always show" are disabled, and the icon is always shown', () => {
				alwaysShow().active = false;
				useShortcut().active = false;
				expect(entry().sensitive).toBe(false);
				expect(alwaysShow().sensitive).toBe(false);
				expect(alwaysShow().active).toBe(true);
				expect(settings.alwaysShow).toBe(true);
			});

			it('both are available again, as they were left, with the shortcut', () => {
				useShortcut().active = false;
				useShortcut().active = true;
				expect(entry().sensitive).toBe(true);
				expect(alwaysShow().sensitive).toBe(true);
				expect(alwaysShow().active).toBe(true);
			});

			it('leaves "always show" as it is while there is a shortcut', async () => {
				raw.set_boolean('always-show', false);
				await open();
				expect(alwaysShow().active).toBe(false);
				expect(settings.alwaysShow).toBe(false);
			});

			it('starts disabled if the setting says so', async () => {
				raw.set_boolean('use-keybinding', false);
				await open();
				expect(entry().sensitive).toBe(false);
				expect(alwaysShow().sensitive).toBe(false);
				expect(alwaysShow().active).toBe(true);
			});
		});

		describe('the list of key names', () => {
			const link = () => row(SHORTCUT, '«List of valid key names»');

			it('shows that it leaves the application, with an icon', () => {
				const [icon] = link().children;
				expect(icon.icon_name).toBe('adw-external-link-symbolic');
			});

			it('is a row that opens the page', () => {
				expect(link().activatable).toBe(true);
				expect(link().subtitle).toBe('https://raw.githubusercontent.com/GNOME/gtk/master/gdk/keynames.txt');
				link().emit('activated');
				expect(launcher.uris).toEqual([
					{
						uri: 'https://raw.githubusercontent.com/GNOME/gtk/master/gdk/keynames.txt',
						context: { launchContext: true },
					},
				]);
			});

			it('logs, says so with a message, and does not throw, when the page cannot be opened', () => {
				const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
				launcher.failWith = new Error('no browser');
				expect(() => link().emit('activated')).not.toThrow();
				expect(window.toasts.map((toast) => [toast.title, toast.use_markup])).toEqual([
					['«Could not open the web page»', false],
				]);
				expect(error).toHaveBeenCalledWith(
					'Cannot open https://raw.githubusercontent.com/GNOME/gtk/master/gdk/keynames.txt',
					launcher.failWith,
				);
				error.mockRestore();
			});
		});
	});

	describe('About', () => {
		const about = () => groups(ABOUT)[0];

		it('presents the extension, with its author and contributors', () => {
			expect(about().title).toBe('«Emoji Selector»');
			expect(about().description).toBe(
				'«This extension provides a configurable popup menu displaying most emojis, clicking on an emoji copies it to the clipboard.»',
			);
			expect(row(ABOUT, '«Author»').subtitle).toBe('Romain F. T.');
			expect(row(ABOUT, '«Contributors»').subtitle).toBe('Jimmy Scionti\nRyan Gonzalez\nxurizaemon\nFran Diéguez');
		});

		it('credits the translators only when the catalogue says who they are', async () => {
			extensionState.translate = (text) => text;
			await open();
			expect(rows(ABOUT).find((candidate) => candidate.title === 'Translator(s)')).toBeUndefined();
			extensionState.translate = (text) => (text === 'translator-credits' ? 'Jane Doe' : text);
			await open();
			expect(rows(ABOUT).find((candidate) => candidate.title === 'Translator(s)').subtitle).toBe('Jane Doe');
		});

		it('links to where bugs and ideas are reported', () => {
			const link = row(ABOUT, '«Report bugs or ideas»');
			expect(link.subtitle).toBe(URL);
			link.emit('activated');
			expect(launcher.uris.map((opened) => opened.uri)).toEqual([URL]);
		});

		it('has no such link when the extension has no web page', async () => {
			await open({ uuid: METADATA.uuid });
			expect(row(ABOUT, '«Report bugs or ideas»')).toBeUndefined();
		});
	});

	it('leaves no settings handler behind when the window is closed', () => {
		expect(raw.connectionCount).toBeGreaterThan(0);
		window.destroy();
		expect(raw.connectionCount).toBe(0);
	});
});
