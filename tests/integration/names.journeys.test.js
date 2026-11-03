// Searching and hovering in the language of the user, through the REAL extension on the fake GNOME runtime.
// (tests/support/names stands for the generated data of the package, see vitest.config.mjs.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EmojiSelectorExtension from '../../src/extension.ts';
import { METADATA } from '../support/paths.js';
import { createSettings } from '../support/settings.js';
import { extensionState, glib, main } from '../support/shell-state.js';

const UUID = METADATA.uuid;

describe('using the extension in another language', () => {
	let raw;
	let settings;
	let extension;
	let error;

	const indicator = () => main.panel.statusArea.get(UUID).indicator;
	const items = () => indicator().menu.items;
	const searchEntry = () => items()[1].children[0];
	const labels = () => items()[2].children[0].children.map((button) => button.label);
	const search = (text) => searchEntry().set_text(text);
	const smileys = () => items()[3].menu.items.flatMap((row) => row.children[0].children);
	/** Waits until the search for `text` finds `emoji` first: the names load in the background. */
	const finds = (text, emoji) =>
		vi.waitFor(
			() => {
				search('');
				search(text);
				expect(labels()[0]).toBe(emoji);
			},
			{ timeout: 5000, interval: 10 },
		);
	/** Gives data that would load (if there were any) the time to do so, for the tests that expect none. */
	const settled = () => new Promise((resolve) => setTimeout(resolve, 100));

	function enable(languageNames) {
		glib.languageNames = languageNames;
		extension.enable();
	}

	beforeEach(() => {
		({ raw, settings } = createSettings());
		settings.recentlyUsed = [];
		extensionState.settings = raw;
		extension = new EmojiSelectorExtension({ uuid: UUID });
		error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		extension.disable();
		error.mockRestore();
	});

	it('finds an emoji by its name in the language of the user', async () => {
		enable(['fr_FR.UTF-8', 'fr_FR', 'fr', 'C']);
		await finds('visage souriant', '😀');
		expect(labels().slice(0, 2)).toEqual(['😀', '']);
		await finds('chat', '🐈');
	});

	it('finds an emoji by a keyword in the language of the user, without the accents', async () => {
		enable(['fr']);
		await finds('boisson', '☕');
		search('CAFEINE');
		expect(labels()[0]).toBe('☕');
	});

	it('still finds the emoji by their English names', async () => {
		enable(['fr']);
		await finds('chat', '🐈');
		search('grinning face');
		expect(labels()[0]).toBe('😀');
		search('cat');
		expect(labels()).toContain('🐈');
	});

	it('shows the name in the language of the user when an emoji is hovered, or in English if it has none', async () => {
		enable(['fr']);
		await finds('chat', '🐈');
		items()[0].children[0].emit('clicked');
		const label = items()[3].label;
		smileys()[0].setHover(true);
		expect(label.text).toBe('visage souriant');
		smileys()[1].setHover(true);
		expect(label.text).toBe('grinning face with smiling eyes');
	});

	it('works in English until the names are loaded, and then shows the results of a search typed meanwhile', async () => {
		enable(['fr']);
		search('chat');
		expect(labels()[0]).not.toBe('🐈');
		await vi.waitFor(() => expect(labels()[0]).toBe('🐈'), { timeout: 5000, interval: 10 });
	});

	it('uses the next language when the first has no data', async () => {
		enable(['de_DE', 'de', 'fr']);
		await finds('chat', '🐈');
		search('visage souriant');
		expect(labels()[0]).toBe('😀');
	});

	it('stays in English for a language without data', async () => {
		enable(['yy_YY', 'yy', 'C']);
		await settled();
		search('chat');
		expect(labels()[0]).not.toBe('🐈');
		expect(error).not.toHaveBeenCalled();
	});

	it('stays in English for English', async () => {
		enable(['en_GB', 'en', 'C']);
		await settled();
		search('cat');
		expect(labels()).toContain('🐈');
		expect(error).not.toHaveBeenCalled();
	});

	it('ignores data that does not fit the table, and says so', async () => {
		enable(['xx']);
		await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), { timeout: 5000, interval: 10 });
		const [message, cause] = error.mock.calls[0];
		expect(message).toBe("Ignoring the emoji names of the user's language");
		expect(cause.message).toBe("'xx' has 1 names for 1513 emojis");
		search('ququ');
		expect(labels()[0]).toBe('');
	});

	it('names nothing once it is disabled before the data is loaded', async () => {
		// (Data that does not fit is complained about, if anyone is still there to hear it.)
		enable(['xx']);
		extension.disable();
		await settled();
		expect(error).not.toHaveBeenCalled();
	});
});
