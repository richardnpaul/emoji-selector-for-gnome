import { beforeEach, describe, expect, it, vi } from 'vitest';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import EmojiSelectorExtension from '../../src/extension.ts';
import { clipboard, extensionState, glib, main } from '../support/shell-state.js';
import { Actor } from '../support/fakes/toolkit.js';
import { METADATA } from '../support/paths.js';
import { createSettings } from '../support/settings.js';

const UUID = METADATA.uuid;

describe('the extension', () => {
	let raw;
	let settings;
	let extension;

	/** Enables the extension the way the Shell does, after setting some settings. */
	function enable(values = {}) {
		for (const [key, value] of Object.entries(values)) {
			const setter = { string: 'set_string', number: 'set_int', boolean: 'set_boolean' }[typeof value];
			raw[setter](key, value);
		}
		extension.enable();
	}

	const indicator = () => main.panel.statusArea.get(UUID);
	const menuButton = () => indicator().indicator;
	const menuItems = () => menuButton().menu.items;
	const keybinding = () => main.wm.keybindings.get('emoji-keybinding');

	beforeEach(() => {
		({ raw, settings } = createSettings());
		extensionState.settings = raw;
		extension = new EmojiSelectorExtension({ uuid: UUID });
	});

	describe('enable', () => {
		it('puts one indicator, first on the right of the panel', () => {
			enable();
			expect([...main.panel.statusArea.keys()]).toEqual([UUID]);
			expect(indicator().position).toBe(0);
			expect(indicator().box).toBe('right');
		});

		it('gives the indicator its menu, with the icons of the extension', () => {
			enable();
			expect(menuItems()).toHaveLength(12);
			const header = menuItems()[0];
			expect(header.children.map((button) => button.child.gicon.path)).toEqual([
				'face-smile-symbolic',
				...['people', 'nature', 'food', 'travel', 'activities', 'objects', 'symbols', 'flags'].map(
					(name) => `${extensionState.path}/icons/emoji-${name}-symbolic.svg`,
				),
			]);
		});

		it('follows the position setting', () => {
			enable({ position: 'bottom' });
			expect(menuItems()[11].children).toHaveLength(9);
		});
	});

	describe('keyboard shortcut', () => {
		it('is registered, toggling the menu, when enabled in the settings', () => {
			enable();
			expect(keybinding().settings).toBe(raw);
			expect(keybinding().flags).toBe(Meta.KeyBindingFlags.NONE);
			expect(keybinding().modes).toBe(Shell.ActionMode.ALL);
			expect(menuButton().menu.isOpen).toBe(false);
			keybinding().handler();
			expect(menuButton().menu.isOpen).toBe(true);
			keybinding().handler();
			expect(menuButton().menu.isOpen).toBe(false);
		});

		it('is not registered when disabled in the settings', () => {
			enable({ 'use-keybinding': false });
			expect(main.wm.keybindings.size).toBe(0);
		});

		it('is unregistered and registered again as the setting changes', () => {
			enable();
			raw.set_boolean('use-keybinding', false);
			expect(main.wm.keybindings.size).toBe(0);
			raw.set_boolean('use-keybinding', true);
			expect([...main.wm.keybindings.keys()]).toEqual(['emoji-keybinding']);
			keybinding().handler();
			expect(menuButton().menu.isOpen).toBe(true);
		});

		it('is only removed when it was added', () => {
			const calls = [];
			const { addKeybinding, removeKeybinding } = main.wm;
			main.wm.addKeybinding = (...args) => {
				calls.push('add');
				return addKeybinding.apply(main.wm, args);
			};
			main.wm.removeKeybinding = (...args) => {
				calls.push('remove');
				return removeKeybinding.apply(main.wm, args);
			};
			try {
				enable({ 'use-keybinding': false });
				raw.set_boolean('use-keybinding', false);
				extension.disable();
				expect(calls).toEqual([]);
				enable({ 'use-keybinding': true });
				raw.set_boolean('use-keybinding', false);
				raw.set_boolean('use-keybinding', false);
				raw.set_boolean('use-keybinding', true);
				extension.disable();
				expect(calls).toEqual(['add', 'remove', 'add', 'remove']);
			} finally {
				main.wm.addKeybinding = addKeybinding;
				main.wm.removeKeybinding = removeKeybinding;
			}
		});

		it('is registered only once when the setting is switched on while it already is', () => {
			enable();
			expect(() => {
				raw.set_boolean('use-keybinding', true);
			}).not.toThrow();
			expect(main.wm.keybindings.size).toBe(1);
		});

		it('still toggles the current menu after the menu was rebuilt', () => {
			enable();
			raw.set_int('nbcols', 12);
			keybinding().handler();
			expect(menuButton().menu.isOpen).toBe(true);
		});
	});

	describe('when something goes wrong', () => {
		it('says so, and does not remove what it could not add, when the Shell refuses the shortcut', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			const { addKeybinding, removeKeybinding } = main.wm;
			const removed = [];
			main.wm.addKeybinding = () => 0;
			main.wm.removeKeybinding = (name) => removed.push(name);
			try {
				enable();
				extension.disable();
			} finally {
				main.wm.addKeybinding = addKeybinding;
				main.wm.removeKeybinding = removeKeybinding;
			}
			expect(error).toHaveBeenCalledExactlyOnceWith(
				"Cannot bind the shortcut 'emoji-keybinding' (the Shell refused it)",
			);
			expect(removed).toEqual([]);
			error.mockRestore();
		});

		it('destroys the button it made when the panel refuses it', () => {
			main.panel.statusArea.set(UUID, { indicator: null, position: 0, box: 'right' });
			expect(() => enable()).toThrow(/Extension point conflict/);
			const buttons = Actor.registry.filter((actor) => actor.constructor.name === 'PanelMenuButton');
			expect(buttons.map((button) => button.destroyed)).toEqual([true]);
			expect(raw.connectionCount).toBe(0);
		});

		it('takes away everything it had set up, and says why, when enabling fails half way', () => {
			const { addKeybinding } = main.wm;
			main.wm.addKeybinding = () => {
				throw new Error('no such key');
			};
			try {
				expect(() => enable()).toThrow('no such key');
			} finally {
				main.wm.addKeybinding = addKeybinding;
			}
			expect(main.panel.statusArea.size).toBe(0);
			expect(raw.connectionCount).toBe(0);
			expect(Actor.registry.every((actor) => actor.destroyed)).toBe(true);
			expect(glib.activeSources).toBe(0);
		});
	});

	describe('when the menu cannot be rebuilt after a settings change', () => {
		const liveButtons = () =>
			Actor.registry.filter((actor) => actor.constructor.name === 'PanelMenuButton' && !actor.destroyed);

		it('keeps the old menu, and says why, when the new one cannot be built', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			enable();
			const old = menuButton();
			const getInt = vi.spyOn(raw, 'get_int').mockImplementation(() => {
				throw new Error('boom');
			});
			raw.set_int('nbcols', 12);
			getInt.mockRestore();
			expect(error).toHaveBeenCalledExactlyOnceWith('Cannot rebuild the menu, keeping the old one', expect.any(Error));
			expect(menuButton()).toBe(old);
			expect(old.destroyed).toBe(false);
			expect(liveButtons()).toEqual([old]);
			keybinding().handler();
			expect(old.menu.isOpen).toBe(true);
			raw.set_boolean('always-show', false);
			expect(old.visible).toBe(true);
			error.mockRestore();
		});

		it('stops cleanly, and says why, when the new menu cannot be put in the panel', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			enable();
			const { addToStatusArea } = main.panel;
			main.panel.addToStatusArea = () => {
				throw new Error('no room');
			};
			try {
				raw.set_int('nbcols', 12);
			} finally {
				main.panel.addToStatusArea = addToStatusArea;
			}
			expect(error).toHaveBeenCalledExactlyOnceWith(
				'Cannot put the rebuilt menu in the panel, stopping',
				expect.any(Error),
			);
			expect(liveButtons()).toEqual([]);
			expect(main.panel.statusArea.size).toBe(0);
			expect(main.wm.keybindings.size).toBe(0);
			expect(raw.connectionCount).toBe(0);
			expect(() => extension.disable()).not.toThrow();
			error.mockRestore();
		});
	});

	describe('reacting to settings changes', () => {
		it('resizes the recent emoji when the emoji size changes', () => {
			enable();
			raw.set_int('emojisize', 44);
			const recents = menuItems()[2].children[0].children;
			expect(recents.map((button) => button.style)).toEqual(Array(11).fill('font-size: 44px; color: #FFFFFF;'));
		});

		it('shows or hides the indicator when "always show" changes', () => {
			enable();
			raw.set_boolean('always-show', false);
			expect(menuButton().visible).toBe(false);
			raw.set_boolean('always-show', true);
			expect(menuButton().visible).toBe(true);
		});

		it('rebuilds the menu with the new number of columns, in the same place', () => {
			enable();
			const before = menuButton();
			raw.set_int('nbcols', 12);
			expect(before.destroyed).toBe(true);
			expect([...main.panel.statusArea.keys()]).toEqual([UUID]);
			expect(indicator().position).toBe(0);
			expect(indicator().box).toBe('right');
			expect(menuItems()[2].children[0].children).toHaveLength(12);
		});

		it('rebuilds the menu when the position changes', () => {
			enable();
			raw.set_string('position', 'bottom');
			expect(menuItems()[11].children).toHaveLength(9);
			expect(menuItems()[0].visible).toBe(false);
		});

		it('keeps one handler per setting it watches', () => {
			enable();
			expect(raw.connectionCount).toBe(5);
			raw.set_int('nbcols', 12);
			expect(raw.connectionCount).toBe(5);
		});
	});

	describe('disable', () => {
		it('removes and destroys the indicator', () => {
			enable();
			const button = menuButton();
			extension.disable();
			expect(main.panel.statusArea.size).toBe(0);
			expect(button.destroyed).toBe(true);
		});

		it('unregisters the shortcut, whatever the setting says by then', () => {
			enable();
			extension.disable();
			expect(main.wm.keybindings.size).toBe(0);
			enable({ 'use-keybinding': false });
			extension.disable();
			expect(main.wm.keybindings.size).toBe(0);
		});

		it('disconnects every settings handler it connected', () => {
			enable();
			expect(raw.connectionCount).toBe(5);
			extension.disable();
			expect(raw.connectionCount).toBe(0);
		});

		it('can be disabled while the menu is open, as when the screen locks', () => {
			enable();
			menuButton().menu.open();
			const button = menuButton();
			expect(() => {
				extension.disable();
			}).not.toThrow();
			expect(button.destroyed).toBe(true);
			expect(glib.activeSources).toBe(0);
			expect(glib.criticals).toBe(0);
		});

		it('leaves the stored recently used emoji alone', () => {
			const stored = settings.recentlyUsed;
			enable();
			menuButton().menu.open();
			extension.disable();
			expect(settings.recentlyUsed).toEqual(stored);
		});

		it('does nothing when it was not enabled', () => {
			expect(() => {
				extension.disable();
			}).not.toThrow();
		});

		it('can be enabled again afterwards, leaving no stale state behind', () => {
			enable();
			extension.disable();
			enable();
			expect([...main.panel.statusArea.keys()]).toEqual([UUID]);
			expect(raw.connectionCount).toBe(5);
			expect(main.wm.keybindings.size).toBe(1);
			const button = menuButton();
			extension.disable();
			expect(button.destroyed).toBe(true);
			expect(raw.connectionCount).toBe(0);
			expect(glib.activeSources).toBe(0);
			expect(clipboard.writes).toEqual([]);
		});
	});
});
