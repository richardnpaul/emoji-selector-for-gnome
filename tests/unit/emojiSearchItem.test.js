import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmojiSearchItem } from '../../src/lib/emojiSearchItem.ts';
import { KeyEvent } from '../support/fakes/toolkit.js';
import { createSettings } from '../support/settings.js';
import { extensionState } from '../support/shell-state.js';

describe('EmojiSearchItem', () => {
	let settings;
	let raw;
	let copy;
	let item;
	let categories;
	const scope = { categoriesToSearch: () => categories };

	/** A category whose search answers from a table of priority -> emoji. */
	const fakeCategory = (answers) => ({
		search: vi.fn((text, found, recent, needed, priority) => answers[priority] ?? []),
	});

	function create(columns, searched = []) {
		categories = searched;
		item = new EmojiSearchItem({ settings, copy }, scope, columns);
		return item;
	}

	const labels = () => item.recents.map((button) => button.actor.label);
	const type = (text) => item.entry.set_text(text);

	beforeEach(() => {
		extensionState.translate = (text) => `«${text}»`;
		({ settings, raw } = createSettings());
		copy = vi.fn();
	});

	describe('construction', () => {
		it('wraps an inert menu item', () => {
			create(3);
			expect(item.searchItem.reactive).toBe(false);
			expect(item.searchItem.can_focus).toBe(false);
		});

		it('contains a translated, focusable search entry', () => {
			create(3);
			const { entry } = item;
			expect(entry.name).toBe('searchEntry');
			expect(entry.style_class).toBe('search-entry');
			expect(entry.can_focus).toBe(true);
			expect(entry.hint_text).toBe('«Type here to search…»');
			expect(entry.track_hover).toBe(true);
			expect(entry.x_expand).toBe(true);
			expect(item.searchItem.children).toEqual([entry]);
		});

		it('searches whenever the entry text changes', () => {
			create(3, [fakeCategory({ keyword: ['S'] })]);
			type('smile');
			expect(labels()).toEqual(['S', '', '']);
		});

		it('creates one recent-emoji button per column in an inert menu item', () => {
			create(4);
			expect(item.recents).toHaveLength(4);
			expect(item.recentsItem.reactive).toBe(false);
			expect(item.recentsItem.can_focus).toBe(false);
			expect(item.recentsItem.children[0].children).toEqual(item.recents.map((button) => button.actor));
		});

		it('activates the first recent/result emoji when Enter is pressed in the entry', () => {
			create(3);
			expect(item.entry.clutter_text.emit('key-press-event', new KeyEvent(0xff0d))).toBe(true);
			expect(copy).toHaveBeenCalledExactlyOnceWith('😂', 'replace-and-close');
		});

		it('ignores other keys typed in the entry', () => {
			create(3);
			expect(item.entry.clutter_text.emit('key-press-event', new KeyEvent(0x61))).toBe(false);
			expect(copy).not.toHaveBeenCalled();
		});

		it('ignores Enter when there is no button at all to activate', () => {
			create(0);
			expect(item.entry.clutter_text.emit('key-press-event', new KeyEvent(0xff0d))).toBe(false);
			expect(copy).not.toHaveBeenCalled();
		});

		it('ignores Enter when no emoji is shown', () => {
			create(3, []);
			type('zzz');
			expect(item.entry.clutter_text.emit('key-press-event', new KeyEvent(0xff0d))).toBe(false);
			expect(copy).not.toHaveBeenCalled();
		});
	});

	describe('recently used emoji', () => {
		it('starts with the stored list', () => {
			create(3);
			expect(labels()).toEqual(['😂', '❤️', '😍']);
		});

		it('pads with penguins when fewer emoji are stored than columns', () => {
			settings.recentlyUsed = ['a'];
			create(3);
			expect(labels()).toEqual(['a', '🐧', '🐧']);
		});

		it('shows only as many as there are columns', () => {
			settings.recentlyUsed = ['a', 'b', 'c', 'd'];
			create(2);
			expect(labels()).toEqual(['a', 'b']);
		});

		it('builds recent buttons that can be focused and are copied as they are', () => {
			create(2);
			expect(item.recents.map((button) => button.actor.can_focus)).toEqual([true, true]);
			item.recents[1].onButtonPress({ get_button: () => 1 });
			expect(copy).toHaveBeenCalledExactlyOnceWith('❤️', 'replace-and-close');
		});

		it('sizes them from the settings, and again when asked', () => {
			create(2);
			expect(item.recents.map((button) => button.actor.style)).toEqual(
				Array(2).fill('font-size: 30px; color: #FFFFFF;'),
			);
			raw.set_int('emojisize', 18);
			item.setEmojiSize(18);
			expect(item.recents.map((button) => button.actor.style)).toEqual(
				Array(2).fill('font-size: 18px; color: #FFFFFF;'),
			);
		});

		describe('recordUse', () => {
			beforeEach(() => {
				settings.recentlyUsed = ['a', 'b', 'c'];
			});

			it('puts a new emoji first and drops the oldest', () => {
				create(3);
				item.recordUse('n');
				expect(settings.recentlyUsed).toEqual(['n', 'a', 'b']);
				expect(labels()).toEqual(['n', 'a', 'b']);
			});

			it('moves a used emoji to the front without duplicating it', () => {
				create(3);
				item.recordUse('b');
				expect(settings.recentlyUsed).toEqual(['b', 'a', 'c']);
				item.recordUse('c');
				expect(settings.recentlyUsed).toEqual(['c', 'b', 'a']);
			});

			it('leaves the list alone when the emoji is already first', () => {
				create(3);
				item.recordUse('a');
				expect(settings.recentlyUsed).toEqual(['a', 'b', 'c']);
			});

			it('removes every copy of an emoji that was stored twice', () => {
				settings.recentlyUsed = ['x', 'x', 'y'];
				create(4);
				item.recordUse('x');
				expect(settings.recentlyUsed).toEqual(['x', 'y']);
			});

			it('keeps no more emoji than there are columns', () => {
				settings.recentlyUsed = ['a', 'b', 'c', 'd'];
				create(2);
				item.recordUse('n');
				expect(settings.recentlyUsed).toEqual(['n', 'a']);
			});

			it('does not store the penguins that pad the display', () => {
				settings.recentlyUsed = ['a'];
				create(3);
				item.recordUse('n');
				expect(settings.recentlyUsed).toEqual(['n', 'a']);
				expect(labels()).toEqual(['n', 'a', '🐧']);
			});

			it('ignores an empty emoji', () => {
				create(3);
				item.recordUse('');
				expect(settings.recentlyUsed).toEqual(['a', 'b', 'c']);
			});

			it('keeps showing the results while a search is on, and the new list once it is cleared', () => {
				create(3, [fakeCategory({ keyword: ['S'] })]);
				type('q');
				expect(labels()).toEqual(['S', '', '']);
				item.recordUse('n');
				expect(labels()).toEqual(['S', '', '']);
				type('');
				expect(labels()).toEqual(['n', 'a', 'b']);
			});
		});
	});

	describe('searching', () => {
		it('shows the recently used emoji again for an empty search', () => {
			const category = fakeCategory({ keyword: ['S'] });
			create(3, [category]);
			type('smile');
			type('');
			expect(labels()).toEqual(['😂', '❤️', '😍']);
			expect(item.recents.map((button) => button.actor.can_focus)).toEqual([true, true, true]);
			expect(category.search).toHaveBeenCalledTimes(4);
		});

		it('searches the lower-cased text', () => {
			const category = fakeCategory({});
			create(2, [category]);
			type('SmILe');
			expect(category.search.mock.calls.map((call) => call[0])).toEqual(['smile', 'smile', 'smile', 'smile']);
		});

		it('looks for recent matches first, then exact names, names, then any keyword', () => {
			const category = fakeCategory({ recent: ['R'], 'exact-name': ['E'], name: ['N'], keyword: ['K'] });
			settings.recentlyUsed = ['R', 'x'];
			create(4, [category]);
			type('q');
			expect(category.search.mock.calls.map((call) => call[4])).toEqual(['recent', 'exact-name', 'name', 'keyword']);
			expect(labels()).toEqual(['R', 'E', 'N', 'K']);
		});

		it('tells each search what was already found, what was used recently, and how many slots remain', () => {
			const category = fakeCategory({ recent: ['R'], 'exact-name': ['E'], name: ['N'], keyword: ['K'] });
			settings.recentlyUsed = ['R', 'x'];
			create(4, [category]);
			type('q');
			const snapshot = category.search.mock.calls.map(([, found, recent, needed]) => [[...found], [...recent], needed]);
			expect(snapshot).toEqual([
				[[], ['R', 'x'], 4],
				[['R'], ['R', 'x'], 3],
				[['R', 'E'], ['R', 'x'], 2],
				[['R', 'E', 'N'], ['R', 'x'], 1],
			]);
		});

		it('leaves unused slots blank and unfocusable', () => {
			create(3, [fakeCategory({ keyword: ['K'] })]);
			type('q');
			expect(labels()).toEqual(['K', '', '']);
			expect(item.recents.map((button) => button.actor.can_focus)).toEqual([true, false, false]);
			expect(item.recents.map((button) => button.actor.track_hover)).toEqual([true, false, false]);
		});

		it('blanks everything when nothing matches', () => {
			create(3, [fakeCategory({})]);
			type('q');
			expect(labels()).toEqual(['', '', '']);
			expect(item.recents.map((button) => button.actor.can_focus)).toEqual([false, false, false]);
		});

		it('keeps only as many results as there are columns', () => {
			create(2, [fakeCategory({ keyword: ['A', 'B', 'C'] })]);
			type('q');
			expect(labels()).toEqual(['A', 'B']);
		});

		it('searches again when asked, for instance after the open category changed', () => {
			const category = fakeCategory({ keyword: ['A'] });
			create(3, [category]);
			type('q');
			categories = [fakeCategory({ keyword: ['B'] })];
			item.refresh();
			expect(labels()).toEqual(['B', '', '']);
		});

		describe('across categories', () => {
			it('searches every category, in order, while a later one still has slots', () => {
				const first = fakeCategory({ keyword: ['A'] });
				const second = fakeCategory({ keyword: ['B'] });
				create(3, [first, second]);
				type('q');
				expect(first.search).toHaveBeenCalledTimes(4);
				expect(second.search).toHaveBeenCalledTimes(4);
				expect(labels()).toEqual(['A', 'B', '']);
			});

			it('stops asking categories once every slot is taken', () => {
				const first = fakeCategory({ keyword: ['A', 'B'] });
				const second = fakeCategory({ keyword: ['C'] });
				create(2, [first, second]);
				type('q');
				expect(second.search.mock.calls.map((call) => call[4])).toEqual(['recent', 'exact-name', 'name']);
				expect(labels()).toEqual(['A', 'B']);
			});

			it('gives later categories only the slots that remain', () => {
				const first = fakeCategory({ keyword: ['A'] });
				const second = fakeCategory({});
				create(3, [first, second]);
				type('q');
				expect(second.search.mock.calls.map((call) => call[3])).toEqual([3, 3, 3, 2]);
			});
		});
	});

	describe('clearing', () => {
		it('empties the entry, which shows the recent emoji again', () => {
			create(3, [fakeCategory({ keyword: ['S'] })]);
			type('q');
			item.clear();
			expect(item.entry.get_text()).toBe('');
			expect(labels()).toEqual(['😂', '❤️', '😍']);
		});
	});
});
