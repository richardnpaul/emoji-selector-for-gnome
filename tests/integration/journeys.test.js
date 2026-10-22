// End-to-end journeys through the REAL extension (menu, categories, search, buttons) on the fake GNOME
// runtime: nothing in the extension is stubbed, and everything is done through the actors a user sees.
import { beforeEach, describe, expect, it } from 'vitest';

import EmojiSelectorExtension from '../../src/extension.ts';
import { EMOJIS_CHARACTERS } from '../../src/data/emojisCharacters.ts';
import { EMOJIS_KEYWORDS } from '../../src/data/emojisKeywords.ts';
import { ButtonEvent, KeyEvent } from '../support/fakes/toolkit.js';
import { Actor } from '../support/fakes/toolkit.js';
import { createSettings } from '../support/settings.js';
import { clipboard, extensionState, glib, main, shellGlobal } from '../support/shell-state.js';

const UUID = 'emoji-selector@maestroschan.fr';
const MEDIUM_TONE = '\u{1F3FD}';
const WOMAN_SIGN = '‍♀️';
const SMILEYS = 0;
const PEOPLE = 1;
const NATURE = 2;
const FLAGS = 8;

describe('using the extension', () => {
	let raw;
	let settings;
	let extension;

	const indicator = () => main.panel.statusArea.get(UUID).indicator;
	const items = () => indicator().menu.items;
	const searchEntry = () => items()[1].children[0];
	const recents = () => items()[2].children[0].children;
	const labels = () => recents().map((button) => button.label);
	const categoryButton = (id) => items()[0].children[id];
	const categoryItem = (id) => items()[3 + id];
	const builtEmoji = (id) => categoryItem(id).menu.items.flatMap((row) => row.children[0].children);
	const click = (actor, mouseButton = 1) => actor.emit('button-press-event', new ButtonEvent(mouseButton));
	const typeInSearch = (text) => searchEntry().set_text(text);
	const pressEnterInSearch = () => searchEntry().clutter_text.emit('key-press-event', new KeyEvent(0xff0d));
	const openMenu = () => {
		indicator().menu.toggle();
		glib.runTimeouts();
	};
	const keywordsOf = (emoji) => {
		for (const [c, category] of EMOJIS_CHARACTERS.entries()) {
			const i = category.indexOf(emoji);
			if (i !== -1) {
				return EMOJIS_KEYWORDS[c][i];
			}
		}
		throw new Error(`${emoji} is not in the tables`);
	};

	beforeEach(() => {
		({ raw, settings } = createSettings());
		extensionState.settings = raw;
		extension = new EmojiSelectorExtension({ uuid: UUID });
		extension.enable();
	});

	it('never reads or writes the clipboard on its own, only for an explicit click or Enter', () => {
		openMenu();
		typeInSearch('face');
		categoryButton(PEOPLE).click();
		builtEmoji(PEOPLE)[0].setHover(true);
		indicator().menu.toggle();
		raw.set_int('emojisize', 20);
		expect(clipboard.reads).toEqual([]);
		expect(clipboard.writes).toEqual([]);
		extension.disable();
		expect(clipboard.reads).toEqual([]);
		expect(clipboard.writes).toEqual([]);
	});

	it('opens with the search focused and the recently used emoji shown', () => {
		openMenu();
		expect(shellGlobal.stage.keyFocus).toBe(searchEntry());
		expect(labels().slice(0, 3)).toEqual(['😂', '❤️', '😍']);
	});

	it('finds emoji while typing, and Enter copies the first result and closes the menu', () => {
		openMenu();
		typeInSearch('smiling face with sunglasses');
		expect(labels()[0]).toBe('😎');
		pressEnterInSearch();
		expect(clipboard.contents).toBe('😎');
		expect(indicator().menu.isOpen).toBe(false);
		expect(settings.recentlyUsed[0]).toBe('😎');
	});

	it('only ever shows emoji that match what was typed', () => {
		openMenu();
		typeInSearch('heart');
		const shown = labels().filter(Boolean);
		expect(shown.length).toBeGreaterThan(3);
		for (const emoji of shown) {
			expect(
				keywordsOf(emoji).some((keyword) => keyword.includes('heart')),
				emoji,
			).toBe(true);
		}
	});

	it('shows nothing, and does nothing on Enter, when nothing matches', () => {
		openMenu();
		typeInSearch('zzzzzzzz');
		expect(labels().every((label) => label === '')).toBe(true);
		pressEnterInSearch();
		expect(clipboard.contents).toBeNull();
		expect(indicator().menu.isOpen).toBe(true);
	});

	it('lists recently used matches first, before the other matches (issue #119)', () => {
		settings.recentlyUsed = ['🦁', '😎', '🐱'];
		openMenu();
		typeInSearch('cool');
		const shown = labels().filter(Boolean);
		expect(shown[0]).toBe('😎');
		expect(new Set(shown).size).toBe(shown.length);
		expect(shown).toContain('🆒');
	});

	it('also lists first an emoji used with a skin tone (what is stored is the toned emoji)', () => {
		settings.skinTone = 3;
		openMenu();
		categoryButton(SMILEYS).click();
		click(builtEmoji(SMILEYS).find((button) => button.label === '👉'));
		expect(settings.recentlyUsed[0]).toBe(`👉${MEDIUM_TONE}`);
		openMenu();
		typeInSearch('pointing');
		const shown = labels().filter(Boolean);
		expect(shown).toContain('👈');
		expect(shown[0]).toBe('👉');
	});

	it('searches only the open category', () => {
		openMenu();
		categoryButton(FLAGS).click();
		typeInSearch('france');
		const flags = new Set(EMOJIS_CHARACTERS[FLAGS]);
		const shown = labels().filter(Boolean);
		expect(shown.length).toBeGreaterThan(0);
		expect(shown.every((emoji) => flags.has(emoji))).toBe(true);
	});

	it('copies a browsed emoji with the chosen skin tone, and remembers it', () => {
		openMenu();
		categoryButton(PEOPLE).click();
		const tones = categoryItem(PEOPLE).children.filter((child) => child.style_class === 'EmojisTone');
		tones[3].click();
		const person = builtEmoji(PEOPLE).find((button) => {
			const words = keywordsOf(button.label);
			return words.includes('HAS_TONE') && !words.includes('IS_GENDERED');
		});
		click(person);
		expect(clipboard.contents).toBe(`${person.label}${MEDIUM_TONE}`);
		expect(settings.skinTone).toBe(3);
		expect(settings.recentlyUsed[0]).toBe(`${person.label}${MEDIUM_TONE}`);
		expect(indicator().menu.isOpen).toBe(false);
	});

	it('applies the chosen gender to an emoji that has one', () => {
		openMenu();
		categoryButton(PEOPLE).click();
		categoryItem(PEOPLE)
			.children.find((child) => child.accessible_name === 'Women')
			.click();
		click(
			builtEmoji(PEOPLE).find((button) => button.label === '🏃'),
			2,
		);
		expect(clipboard.contents).toBe(`🏃${WOMAN_SIGN}`);
		expect(indicator().menu.isOpen).toBe(true);
	});

	it('builds up a message with right-clicks', () => {
		openMenu();
		categoryButton(SMILEYS).click();
		const [first, second] = builtEmoji(SMILEYS);
		click(first, 2);
		clipboard.contents = 'hello ';
		click(first, 3);
		clipboard.flush();
		click(second, 3);
		clipboard.flush();
		expect(clipboard.contents).toBe(`hello ${first.label}${second.label}`);
	});

	it('names the hovered emoji in the open category, then restores the category name', () => {
		openMenu();
		categoryButton(SMILEYS).click();
		const [first] = builtEmoji(SMILEYS);
		first.setHover(true);
		expect(categoryItem(SMILEYS).label.text).toBe(keywordsOf(first.label)[0]);
		first.setHover(false);
		expect(categoryItem(SMILEYS).label.text).toBe('Smileys & Body');
	});

	it('has the shortcut toggle the menu', () => {
		main.wm.keybindings.get('emoji-keybinding').handler();
		expect(indicator().menu.isOpen).toBe(true);
	});

	it('keeps working after a settings change made while it runs', () => {
		raw.set_int('nbcols', 12);
		raw.set_int('emojisize', 26);
		raw.set_boolean('always-show', false);
		openMenu();
		typeInSearch('cat');
		expect(labels().filter(Boolean).length).toBeGreaterThan(0);
		categoryButton(NATURE).click();
		expect(categoryItem(NATURE).menu.items[0].children[0].children).toHaveLength(12);
		expect(builtEmoji(NATURE)[0].style).toBe('font-size: 26px; color: #FFFFFF;');
	});

	describe('being enabled and disabled repeatedly', () => {
		it('leaves nothing behind, however often', () => {
			const generations = [];
			for (let i = 0; i < 4; i++) {
				generations.push(indicator());
				openMenu();
				typeInSearch('face');
				extension.disable();
				expect(main.panel.statusArea.size).toBe(0);
				expect(main.wm.keybindings.size).toBe(0);
				expect(raw.connectionCount).toBe(0);
				expect(glib.activeSources).toBe(0);
				expect(glib.criticals).toBe(0);
				extension.enable();
			}
			for (const old of generations) {
				expect(old.destroyed).toBe(true);
				expect(old.descendants().every((actor) => actor.destroyed)).toBe(true);
			}
			expect(main.panel.statusArea.size).toBe(1);
		});

		it('destroys every actor it created, however it was used', () => {
			openMenu();
			typeInSearch('face');
			categoryButton(PEOPLE).click();
			categoryButton(FLAGS).click();
			raw.set_int('nbcols', 12);
			extension.disable();
			const leaked = Actor.registry.filter((actor) => !actor.destroyed);
			expect(leaked.map((actor) => `${actor.constructor.name}:${actor.style_class || actor.name || ''}`)).toEqual([]);
		});

		it('keeps the recently used emoji across a restart', () => {
			openMenu();
			typeInSearch('smiling face with sunglasses');
			pressEnterInSearch();
			extension.disable();
			extension.enable();
			expect(labels()[0]).toBe('😎');
		});
	});
});
