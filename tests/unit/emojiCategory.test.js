import { beforeEach, describe, expect, it, vi } from 'vitest';
import Clutter from 'gi://Clutter';

import { Emoji } from '../../src/lib/emoji.ts';
import { EmojiCategory, hideSubmenuArrow } from '../../src/lib/emojiCategory.ts';
import { extensionState } from '../support/shell-state.js';
import { createSettings } from '../support/settings.js';

const EMOJIS = [
	new Emoji('A', ['sun', 'bright', 'day']),
	new Emoji('B', ['sunflower', 'plant', 'sun']),
	new Emoji('C', ['moon', 'night', 'sunless']),
	new Emoji('D', ['star', 'night']),
	new Emoji('E', ['sun glasses', 'cool']),
];

const ICON = { path: '/fake/icons/emoji-flags-symbolic.svg' };

describe('EmojiCategory', () => {
	let settings;
	let context;
	let host;
	let calls;

	beforeEach(() => {
		extensionState.translate = (text) => `«${text}»`;
		({ settings } = createSettings());
		context = { settings, copy: vi.fn() };
		calls = [];
		host = {
			clearCategories: vi.fn(() => calls.push('clearCategories')),
			categoryOpened: vi.fn(() => calls.push('categoryOpened')),
		};
	});

	const category = ({ id = 8, emojis = EMOJIS, picker = null, columns = 10 } = {}) =>
		new EmojiCategory(context, host, { id, name: 'Flags', icon: ICON, emojis, picker }, columns);
	const rows = (cat) => cat.item.menu.items;
	const rowButtons = (row) => row.children[0].children;

	describe('construction', () => {
		it('creates a hidden, inert submenu item named after the category', () => {
			const { item } = category();
			expect(item.label.text).toBe('Flags');
			expect(item.visible).toBe(false);
			expect(item.reactive).toBe(false);
			expect(item._triangleBin.visible).toBe(false);
		});

		it('hides the arrow of a submenu item that has one, and copes with one that has none', () => {
			const arrow = { visible: true };
			hideSubmenuArrow({ _triangleBin: arrow });
			expect(arrow.visible).toBe(false);
			expect(() => hideSubmenuArrow({})).not.toThrow();
		});

		it('creates its toggle button with an icon and an accessible name', () => {
			const { button } = category();
			expect(button.reactive).toBe(true);
			expect(button.can_focus).toBe(true);
			expect(button.track_hover).toBe(true);
			expect(button.toggle_mode).toBe(true);
			expect(button.accessible_name).toBe('Flags');
			expect(button.style_class).toBe('EmojisCategory');
			expect(button.x_expand).toBe(true);
			expect(button.x_align).toBe(Clutter.ActorAlign.CENTER);
			expect(button.child.gicon).toBe(ICON);
			expect(button.child.icon_size).toBe(16);
		});

		it('exposes its id and keeps its emoji, without creating any button yet', () => {
			const cat = category({ id: 3 });
			expect(cat.id).toBe(3);
			expect(rows(cat)).toHaveLength(0);
		});

		it.each([
			[null, 0, 0],
			['tones', 6, 0],
			['tones-and-genders', 6, 2],
		])('with picker %j it shows %i skin tone and %i gender buttons in its item', (picker, toneCount, genderCount) => {
			const { item } = category({ picker });
			const styled = (name) => item.children.filter((c) => c.style_class === name).length;
			expect([styled('EmojisTone'), styled('EmojisGender')]).toEqual([toneCount, genderCount]);
		});
	});

	describe('searching', () => {
		const find = (text, { found = [], recent = [], needed = 10, priority = 'keyword' } = {}) =>
			category().search(text, found, recent, needed, priority);

		it('priority exact-name finds only emoji whose name is exactly the text', () => {
			expect(find('sun', { priority: 'exact-name' })).toEqual(['A']);
			expect(find('sunflower', { priority: 'exact-name' })).toEqual(['B']);
			expect(find('plant', { priority: 'exact-name' })).toEqual([]);
			expect(find('su', { priority: 'exact-name' })).toEqual([]);
		});

		it('priority name finds emoji whose name contains the text', () => {
			expect(find('sun', { priority: 'name' })).toEqual(['A', 'B', 'E']);
			expect(find('night', { priority: 'name' })).toEqual([]);
		});

		it('priority keyword finds emoji with the text anywhere in their keywords', () => {
			expect(find('sun', { priority: 'keyword' })).toEqual(['A', 'B', 'C', 'E']);
			expect(find('night')).toEqual(['C', 'D']);
			expect(find('zzz')).toEqual([]);
		});

		it('priority recent finds only recently used emoji that match by name or keyword', () => {
			expect(find('sun', { priority: 'recent', recent: ['C', 'E', 'D'] })).toEqual(['C', 'E']);
			expect(find('night', { priority: 'recent', recent: ['A', 'D'] })).toEqual(['D']);
			expect(find('moon', { priority: 'recent', recent: ['C'] })).toEqual(['C']);
			expect(find('sun', { priority: 'recent', recent: [] })).toEqual([]);
			expect(find('sun', { priority: 'recent', recent: ['D'] })).toEqual([]);
		});

		it('priority recent also finds a recently used emoji that was copied with a skin tone or gender', () => {
			const emojis = [
				new Emoji('👉', ['backhand index pointing right', 'HAS_TONE']),
				new Emoji('🏃', ['person running', 'HAS_TONE', 'HAS_GENDER']),
				new Emoji('👈', ['backhand index pointing left', 'HAS_TONE']),
			];
			const recent = ['\u{1F449}\u{1F3FD}', '\u{1F3C3}‍♀️'];
			expect(category({ emojis }).search('o', [], recent, 10, 'recent')).toEqual(['👉', '🏃']);
			expect(category({ emojis }).search('o', [], [], 10, 'recent')).toEqual([]);
		});

		it('skips emoji that are already among the results', () => {
			expect(find('sun', { found: ['A', 'E'] })).toEqual(['B', 'C']);
			expect(find('sun', { found: ['A'], priority: 'exact-name' })).toEqual([]);
		});

		it('returns no more emoji than the slots available', () => {
			expect(find('sun', { needed: 2 })).toEqual(['A', 'B']);
			expect(find('sun', { needed: 1 })).toEqual(['A']);
			expect(find('sun', { needed: 0 })).toEqual([]);
			expect(find('sun', { needed: -3 })).toEqual([]);
		});

		it('does not need the submenu to be built', () => {
			const cat = category();
			cat.search('sun', [], [], 10, 'keyword');
			expect(rows(cat)).toHaveLength(0);
		});
	});

	describe('building the submenu', () => {
		it('lays the emoji out in rows of the configured width', () => {
			const cat = category({ columns: 2 });
			cat.build();
			expect(rows(cat)).toHaveLength(3);
			expect(rows(cat).map((row) => rowButtons(row).length)).toEqual([2, 2, 1]);
			expect(rows(cat).flatMap((row) => rowButtons(row).map((b) => b.label))).toEqual(['A', 'B', 'C', 'D', 'E']);
		});

		it('makes each row an inert, hover-less list item', () => {
			const cat = category();
			cat.build();
			const [row] = rows(cat);
			expect(row.style_class).toBe('EmojisList');
			expect(row.reactive).toBe(false);
			expect(row.can_focus).toBe(false);
			expect(row.track_hover).toBe(false);
		});

		it('shows the name of the hovered emoji in its label, and its own name after', () => {
			const cat = category();
			cat.build();
			const [first] = rowButtons(rows(cat)[0]);
			first.setHover(true);
			expect(cat.item.label.text).toBe('sun');
			first.setHover(false);
			expect(cat.item.label.text).toBe('Flags');
		});

		it('builds only once', () => {
			const cat = category({ columns: 2 });
			cat.build();
			cat.build();
			expect(rows(cat)).toHaveLength(3);
		});

		it('sizes the emoji from the settings when it builds them', () => {
			settings.raw.set_int('emojisize', 24);
			const cat = category();
			cat.build();
			expect(rows(cat).flatMap((row) => rowButtons(row).map((b) => b.style))).toEqual(
				Array(5).fill('font-size: 24px; color: #FFFFFF;'),
			);
		});

		it('copies through its context', () => {
			const cat = category();
			cat.build();
			rowButtons(rows(cat)[0])[1].emit('button-press-event', { get_button: () => 3 });
			expect(context.copy).toHaveBeenCalledExactlyOnceWith('B', 'append');
		});
	});

	describe('opening and closing', () => {
		it('its button opens a closed category', () => {
			const cat = category();
			cat.button.click();
			expect(cat.item.menu.isOpen).toBe(true);
		});

		it('its button closes an open category by clearing them all', () => {
			const cat = category();
			cat.item.setSubmenuShown(true);
			cat.button.click();
			expect(host.clearCategories).toHaveBeenCalledTimes(1);
			expect(host.categoryOpened).not.toHaveBeenCalled();
		});

		it('opening clears the categories first, then shows this one and tells the host', () => {
			const cat = category({ id: 8 });
			cat.item.label.text = 'a hovered emoji name';
			cat.open();
			expect(calls).toEqual(['clearCategories', 'categoryOpened']);
			expect(host.categoryOpened).toHaveBeenCalledWith(8);
			expect(cat.item.label.text).toBe('Flags');
			expect(cat.button.checked).toBe(true);
			expect(cat.item.visible).toBe(true);
			expect(cat.item.menu.isOpen).toBe(true);
		});

		it('opening builds the submenu once', () => {
			const cat = category({ columns: 5 });
			cat.open();
			expect(rows(cat)).toHaveLength(1);
			cat.open();
			expect(rows(cat)).toHaveLength(1);
		});

		it('closing unchecks the button and hides the submenu', () => {
			const cat = category();
			cat.open();
			cat.close();
			expect(cat.button.checked).toBe(false);
			expect(cat.item.visible).toBe(false);
			expect(cat.item.menu.isOpen).toBe(false);
		});

		it('refreshes the skin tone bar each time it opens', () => {
			const cat = category({ picker: 'tones-and-genders' });
			const checked = () => cat.item.children.filter((c) => c.style_class === 'EmojisTone').map((b) => b.checked);
			settings.skinTone = 2;
			cat.open();
			expect(checked()).toEqual([false, false, true, false, false, false]);
			settings.skinTone = 4;
			cat.open();
			expect(checked()).toEqual([false, false, false, false, true, false]);
		});
	});

	describe('restyling', () => {
		it('resizes every built emoji', () => {
			const cat = category();
			cat.build();
			cat.setEmojiSize(24);
			expect(rows(cat).flatMap((row) => rowButtons(row).map((b) => b.style))).toEqual(
				Array(5).fill('font-size: 24px; color: #FFFFFF;'),
			);
		});

		it('does nothing, and does not throw, before the emoji were built, since they are sized when built', () => {
			const cat = category();
			cat.setEmojiSize(24);
			cat.build();
			expect(rowButtons(rows(cat)[0])[0].style).toBe('font-size: 30px; color: #FFFFFF;');
		});
	});
});
