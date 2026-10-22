import { beforeEach, describe, expect, it } from 'vitest';

import { Emoji } from '../../src/lib/emoji.ts';
import { EmojiMenu } from '../../src/lib/emojiMenu.ts';
import { clipboard, glib, shellGlobal, extensionState } from '../support/shell-state.js';
import { createSettings } from '../support/settings.js';

const CATEGORY_LABELS = [
	'Smileys & Body',
	'Peoples & Clothing',
	'Animals & Nature',
	'Food & Drink',
	'Travel & Places',
	'Activities & Sports',
	'Objects',
	'Symbols',
	'Flags',
];
const CATEGORY_ICONS = [
	'face-smile-symbolic',
	'/ext/icons/emoji-people-symbolic.svg',
	'/ext/icons/emoji-nature-symbolic.svg',
	'/ext/icons/emoji-food-symbolic.svg',
	'/ext/icons/emoji-travel-symbolic.svg',
	'/ext/icons/emoji-activities-symbolic.svg',
	'/ext/icons/emoji-objects-symbolic.svg',
	'/ext/icons/emoji-symbols-symbolic.svg',
	'/ext/icons/emoji-flags-symbolic.svg',
];

/** Nine categories of three emoji each, named "face 0.0" to "face 8.2"; the first of each has a tone. */
const catalogue = () =>
	Array.from({ length: 9 }, (_category, c) =>
		Array.from(
			{ length: 3 },
			(_emoji, i) => new Emoji(`${c}${'abc'[i]}`, [`face ${c}.${i}`, ...(i === 0 ? ['HAS_TONE'] : [])]),
		),
	);

describe('EmojiMenu', () => {
	let settings;
	let raw;
	let menu;

	function create(values = {}) {
		for (const [key, value] of Object.entries(values)) {
			const setter = { string: 'set_string', number: 'set_int', boolean: 'set_boolean' }[typeof value];
			raw[setter](key, value);
		}
		menu = new EmojiMenu(settings, catalogue(), '/ext/icons');
		return menu;
	}

	const items = () => menu.button.menu.items;
	const recentLabels = () => menu.searchItem.recents.map((button) => button.actor.label);

	beforeEach(() => {
		extensionState.translate = (text) => `«${text}»`;
		({ settings, raw } = createSettings());
		raw.set_int('nbcols', 10);
	});

	describe('the panel button', () => {
		it('has a translated name and a "cool face" icon', () => {
			create();
			expect(menu.button.nameText).toBe('«Emoji Selector»');
			expect(menu.button.menuAlignment).toBe(0);
			const [box] = menu.button.children;
			expect(box.children).toHaveLength(1);
			expect(box.children[0].icon_name).toBe('face-cool-symbolic');
			expect(box.children[0].style_class).toBe('system-status-icon');
		});

		it('is visible only if "always show" is on', () => {
			expect(create().button.visible).toBe(true);
			expect(create({ 'always-show': false }).button.visible).toBe(false);
		});

		it('follows "always show" when told it changed, but stays visible while open', () => {
			create();
			raw.set_boolean('always-show', false);
			menu.refreshVisibility();
			expect(menu.button.visible).toBe(false);
			menu.toggle();
			raw.set_boolean('always-show', true);
			menu.refreshVisibility();
			expect(menu.button.visible).toBe(true);
			raw.set_boolean('always-show', false);
			menu.refreshVisibility();
			expect(menu.button.visible).toBe(true);
		});
	});

	describe('categories', () => {
		it('are nine, in order, with translated names and their icons', () => {
			create();
			expect(menu.categories.map((category) => category.name)).toEqual(CATEGORY_LABELS.map((label) => `«${label}»`));
			expect(menu.categories.map((category) => category.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
			expect(menu.categories.map((category) => category.button.child.gicon.path)).toEqual(CATEGORY_ICONS);
		});

		it('offer skin tones only in the first, people and activities categories, and genders in the last two', () => {
			create();
			const count = (category, style) => category.item.children.filter((child) => child.style_class === style).length;
			expect(
				menu.categories.map((category) => [count(category, 'EmojisTone'), count(category, 'EmojisGender')]),
			).toEqual([
				[6, 0],
				[6, 2],
				[0, 0],
				[0, 0],
				[0, 0],
				[6, 2],
				[0, 0],
				[0, 0],
				[0, 0],
			]);
		});

		it('lay their emoji out in rows as wide as the configured number of columns', () => {
			create({ nbcols: 12 });
			expect(menu.searchItem.recents).toHaveLength(12);
			const rowWidths = menu.categories.map((category) => {
				category.build();
				return category.item.menu.items.map((row) => row.children[0].children.length);
			});
			expect(rowWidths).toEqual(Array(9).fill([3]));
		});
	});

	it('copes with a catalogue that has fewer categories, which are then empty', () => {
		menu = new EmojiMenu(settings, [], '/ext/icons');
		expect(menu.categories).toHaveLength(9);
		expect(menu.categories.map((category) => category.search('face', [], [], 10, 'keyword'))).toEqual(
			Array(9).fill([]),
		);
	});

	describe('layout', () => {
		it('puts the category buttons, search and recent emoji above the categories when position is top', () => {
			create({ position: 'top' });
			expect(items()).toHaveLength(12);
			expect(items()[0]).toBe(menu.headerItem);
			expect(items()[1]).toBe(menu.searchItem.searchItem);
			expect(items()[2]).toBe(menu.searchItem.recentsItem);
			expect(items().slice(3)).toEqual(menu.categories.map((category) => category.item));
		});

		it('puts them below the categories, in reverse, when position is bottom', () => {
			create({ position: 'bottom' });
			expect(items()).toHaveLength(12);
			expect(items().slice(0, 9)).toEqual(menu.categories.map((category) => category.item));
			expect(items()[9]).toBe(menu.searchItem.recentsItem);
			expect(items()[10]).toBe(menu.searchItem.searchItem);
			expect(items()[11]).toBe(menu.headerItem);
		});

		it('shows all nine category buttons in an inert header row', () => {
			create();
			expect(menu.headerItem.reactive).toBe(false);
			expect(menu.headerItem.can_focus).toBe(false);
			expect(menu.headerItem.children).toEqual(menu.categories.map((category) => category.button));
		});
	});

	describe('opening and closing the menu', () => {
		it('shows the button while open even if it is normally hidden, and hides it after', () => {
			create({ 'always-show': false });
			menu.toggle();
			expect(menu.button.visible).toBe(true);
			menu.toggle();
			expect(menu.button.visible).toBe(false);
		});

		it('empties the search entry whenever the menu opens or closes', () => {
			create();
			menu.searchItem.entry.set_text('smile');
			menu.toggle();
			expect(menu.searchItem.entry.get_text()).toBe('');
			menu.searchItem.entry.set_text('again');
			menu.toggle();
			expect(menu.searchItem.entry.get_text()).toBe('');
		});

		it('focuses the search entry shortly after opening, not before', () => {
			create();
			menu.toggle();
			expect(shellGlobal.stage.keyFocus).toBeNull();
			expect(glib.pendingIntervals()).toEqual([20]);
			glib.runTimeouts();
			expect(shellGlobal.stage.keyFocus).toBe(menu.searchItem.entry);
			expect(glib.activeSources).toBe(0);
		});

		it('does not take the focus when the menu was closed again', () => {
			create();
			menu.toggle();
			menu.toggle();
			expect(glib.activeSources).toBe(0);
			glib.runTimeouts();
			expect(shellGlobal.stage.keyFocus).toBeNull();
			expect(glib.criticals).toBe(0);
		});

		it('never has more than one focus timer pending, and never removes one twice', () => {
			create();
			menu.toggle();
			menu.toggle();
			menu.toggle();
			expect(glib.activeSources).toBe(1);
			expect(glib.criticals).toBe(0);
			glib.runTimeouts();
			menu.toggle();
			expect(glib.criticals).toBe(0);
		});

		it('refreshes the recently used emoji when the menu opens, even if the entry was already empty', () => {
			create();
			raw.set_strv('recently-used', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
			expect(recentLabels()[0]).toBe('😂');
			menu.toggle();
			expect(recentLabels()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
		});
	});

	describe('categories opening and closing', () => {
		it('a header button opens its category, closing the one that was open', () => {
			create();
			const [first, second] = menu.categories;
			first.button.click();
			expect(first.item.visible).toBe(true);
			expect(first.button.checked).toBe(true);
			second.button.click();
			expect(first.item.visible).toBe(false);
			expect(first.button.checked).toBe(false);
			expect(second.item.visible).toBe(true);
		});

		it('the same button closes it again', () => {
			create();
			const [first] = menu.categories;
			first.button.click();
			first.button.click();
			expect(first.item.visible).toBe(false);
			expect(first.button.checked).toBe(false);
		});

		it('closing the menu closes the open category, whichever the layout', () => {
			for (const position of ['top', 'bottom']) {
				create({ position });
				menu.categories[4].button.click();
				menu.toggle();
				menu.toggle();
				expect(menu.categories.map((category) => category.item.visible)).toEqual(Array(9).fill(false));
				expect(menu.categories[4].item.menu.isOpen).toBe(false);
				expect(menu.headerItem.visible).toBe(true);
				expect(menu.searchItem.searchItem.visible).toBe(true);
				menu.destroy();
			}
		});

		it('searches every category until one is opened, then only that one (category 0 included)', () => {
			create();
			expect(menu.categoriesToSearch()).toEqual(menu.categories);
			menu.categories[0].button.click();
			expect(menu.categoriesToSearch()).toEqual([menu.categories[0]]);
			menu.categories[8].button.click();
			expect(menu.categoriesToSearch()).toEqual([menu.categories[8]]);
			menu.categories[8].button.click();
			expect(menu.categoriesToSearch()).toEqual(menu.categories);
		});

		it('restricts the search results to a category as soon as it is opened', () => {
			create();
			menu.searchItem.entry.set_text('face');
			expect(recentLabels().filter(Boolean)).toHaveLength(10);
			menu.categories[8].button.click();
			expect(recentLabels().filter(Boolean)).toEqual(['8a', '8b', '8c']);
		});

		it('searches everything again when the category is closed', () => {
			create();
			menu.searchItem.entry.set_text('face 3.1');
			menu.categories[8].button.click();
			expect(recentLabels().filter(Boolean)).toEqual([]);
			menu.categories[8].button.click();
			expect(recentLabels().filter(Boolean)).toEqual(['3b']);
		});
	});

	describe('copying', () => {
		const click = (button, which) => button.emit('button-press-event', { get_button: () => which });
		let emoji;

		beforeEach(() => {
			create();
			clipboard.contents = 'old';
			menu.categories[2].button.click();
			emoji = menu.categories[2].item.menu.items[0].children[0].children[1];
		});

		it('replaces the clipboard on a left click, closes the menu and remembers the emoji', () => {
			menu.toggle();
			menu.categories[2].button.click();
			emoji = menu.categories[2].item.menu.items[0].children[0].children[1];
			click(emoji, 1);
			expect(clipboard.contents).toBe('2b');
			expect(menu.button.menu.isOpen).toBe(false);
			expect(settings.recentlyUsed[0]).toBe('2b');
		});

		it('replaces the clipboard on a middle click, and keeps the menu open', () => {
			menu.toggle();
			click(emoji, 2);
			expect(clipboard.contents).toBe('2b');
			expect(menu.button.menu.isOpen).toBe(true);
			expect(settings.recentlyUsed[0]).toBe('2b');
		});

		it('appends to the clipboard on a right click, and keeps the menu open', () => {
			menu.toggle();
			click(emoji, 3);
			clipboard.flush();
			expect(clipboard.contents).toBe('old2b');
			expect(menu.button.menu.isOpen).toBe(true);
			expect(settings.recentlyUsed[0]).toBe('2b');
		});

		it('copies a recently used emoji as it was stored', () => {
			settings.recentlyUsed = ['x', 'y'];
			menu.clearCategories();
			click(menu.searchItem.recents[1].actor, 2);
			expect(clipboard.contents).toBe('y');
			expect(settings.recentlyUsed.slice(0, 2)).toEqual(['y', 'x']);
		});

		it('records the emoji with its skin tone, once, and not the one clicked with an unknown button', () => {
			settings.skinTone = 3;
			const toned = menu.categories[2].item.menu.items[0].children[0].children[0];
			click(toned, 4);
			expect(settings.recentlyUsed[0]).not.toBe('2a');
			click(toned, 2);
			expect(clipboard.contents).toBe('2a\u{1F3FD}');
			expect(settings.recentlyUsed.filter((used) => used === '2a\u{1F3FD}')).toHaveLength(1);
		});
	});

	describe('restyling', () => {
		it('resizes the recent emoji and the emoji of the opened categories', () => {
			create();
			menu.categories[2].button.click();
			menu.setEmojiSize(44);
			expect(menu.searchItem.recents.map((button) => button.actor.style)).toEqual(
				Array(10).fill('font-size: 44px; color: #FFFFFF;'),
			);
			const built = menu.categories[2].item.menu.items.flatMap((row) => row.children[0].children);
			expect(built.map((button) => button.style)).toEqual(Array(3).fill('font-size: 44px; color: #FFFFFF;'));
		});

		it('copes with categories that were never opened', () => {
			create();
			expect(() => {
				menu.setEmojiSize(20);
			}).not.toThrow();
		});
	});

	describe('destroy', () => {
		it('destroys the button, its menu and everything in it', () => {
			create();
			menu.categories[0].button.click();
			menu.destroy();
			expect(menu.button.destroyed).toBe(true);
			expect(menu.searchItem.searchItem.destroyed).toBe(true);
		});

		it('removes a focus timer that is still pending', () => {
			create();
			menu.toggle();
			expect(glib.activeSources).toBe(1);
			menu.destroy();
			expect(glib.activeSources).toBe(0);
			expect(glib.criticals).toBe(0);
		});

		it('does not try to remove a timer that already fired', () => {
			create();
			menu.toggle();
			glib.runTimeouts();
			menu.destroy();
			expect(glib.criticals).toBe(0);
		});

		it('can happen while the menu is open, as when the screen locks', () => {
			create();
			menu.toggle();
			expect(() => {
				menu.destroy();
			}).not.toThrow();
			expect(glib.activeSources).toBe(0);
			expect(glib.criticals).toBe(0);
		});

		it('leaves the stored recently used emoji alone, even in the middle of a search', () => {
			create();
			const stored = settings.recentlyUsed;
			menu.toggle();
			menu.searchItem.entry.set_text('face');
			menu.destroy();
			expect(settings.recentlyUsed).toEqual(stored);
		});
	});
});
