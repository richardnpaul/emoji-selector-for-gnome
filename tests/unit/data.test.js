import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EMOJIS_CHARACTERS } from '../../src/data/emojisCharacters.ts';
import { EMOJIS_KEYWORDS } from '../../src/data/emojisKeywords.ts';

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/emoji-data.json');

/** One emoji per line, so that a change to the tables is an easy-to-review diff. */
function formatGolden(categories) {
	const lines = categories.map(
		(category) => '\t[\n' + category.map((entry) => `\t\t${JSON.stringify(entry)}`).join(',\n') + '\n\t]',
	);
	return `[\n${lines.join(',\n')}\n]\n`;
}

const MARKERS = ['HAS_TONE', 'HAS_GENDER', 'IS_GENDERED'];
const CATEGORY_COUNT = 9;

describe('emoji data tables', () => {
	const characters = EMOJIS_CHARACTERS;
	const keywords = EMOJIS_KEYWORDS;

	const everyEmoji = () =>
		characters.flatMap((category, c) =>
			category.map((emoji, i) => ({ emoji, words: keywords[c][i], category: c, index: i })),
		);

	// The tables are the extension's content, so any change must be a deliberate, reviewed one:
	// regenerate the fixture with `UPDATE_GOLDEN=1 npm run test:unit` and review the diff.
	it('matches the reviewed golden copy exactly (every emoji, name and keyword)', () => {
		const actual = characters.map((category, c) => category.map((emoji, i) => [emoji, keywords[c][i]]));
		if (process.env.UPDATE_GOLDEN) {
			writeFileSync(GOLDEN, formatGolden(actual));
		}
		expect(actual).toStrictEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
	});

	it('has nine categories in both tables', () => {
		expect(characters).toHaveLength(CATEGORY_COUNT);
		expect(keywords).toHaveLength(CATEGORY_COUNT);
	});

	it('has one keyword group per emoji in every category', () => {
		expect(characters.map((c) => c.length)).toEqual(keywords.map((k) => k.length));
	});

	it('is not empty', () => {
		for (const category of characters) {
			expect(category.length).toBeGreaterThan(10);
		}
	});

	it('lists emoji as non-empty, well-formed strings without whitespace', () => {
		for (const { emoji, category, index } of everyEmoji()) {
			expect(typeof emoji, `${category}:${index}`).toBe('string');
			expect(emoji.length, `${category}:${index}`).toBeGreaterThan(0);
			expect(emoji.isWellFormed(), `${category}:${index}`).toBe(true);
			expect(emoji, `${category}:${index}`).not.toMatch(/\s/);
		}
	});

	it('lists every emoji once', () => {
		const seen = new Map();
		const duplicates = [];
		for (const { emoji, category, index } of everyEmoji()) {
			if (seen.has(emoji)) {
				duplicates.push(`${emoji} at ${seen.get(emoji)} and ${category}:${index}`);
			}
			seen.set(emoji, `${category}:${index}`);
		}
		expect(duplicates).toEqual([]);
	});

	it('gives every emoji a name followed by keywords, all non-empty strings', () => {
		for (const { words, category, index } of everyEmoji()) {
			expect(Array.isArray(words), `${category}:${index}`).toBe(true);
			expect(words.length, `${category}:${index}`).toBeGreaterThan(0);
			for (const word of words) {
				expect(typeof word, `${category}:${index}`).toBe('string');
				expect(word.length, `${category}:${index}`).toBeGreaterThan(0);
			}
			expect(MARKERS, `${category}:${index} must start with its name`).not.toContain(words[0]);
		}
	});

	it('has no keyword with leading or trailing whitespace, which could never match what is typed', () => {
		const offenders = [];
		for (const { emoji, words, category, index } of everyEmoji()) {
			for (const word of words.filter((w) => w.trim() !== w)) {
				offenders.push(`${emoji} (${category}:${index}) ${JSON.stringify(word)}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('keeps search keywords in lower case, since the search lower-cases what is typed', () => {
		const offenders = [];
		for (const { emoji, words, category, index } of everyEmoji()) {
			for (const word of words.filter((w) => !MARKERS.includes(w))) {
				if (word !== word.toLowerCase()) {
					offenders.push(`${emoji} (${category}:${index}) "${word}"`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('only uses the three known tag markers, each at most once', () => {
		for (const { words, category, index } of everyEmoji()) {
			for (const marker of MARKERS) {
				expect(words.filter((w) => w === marker).length, `${category}:${index} ${marker}`).toBeLessThanOrEqual(1);
			}
			const upper = words.filter((w) => w === w.toUpperCase() && /[A-Z_]{4,}/.test(w));
			expect(
				upper.filter((w) => !MARKERS.includes(w)),
				`${category}:${index}`,
			).toEqual([]);
		}
	});

	it('only marks emoji that contain a woman or a man as "gendered" when they also take a skin tone', () => {
		// A skin tone is inserted right after the first woman or man in the sequence.
		const offenders = everyEmoji()
			.filter(({ words }) => words.includes('IS_GENDERED') && words.includes('HAS_TONE'))
			.filter(({ emoji }) => !emoji.includes('\u{1F469}') && !emoji.includes('\u{1F468}'))
			.map(({ emoji }) => emoji);
		expect(offenders).toEqual([]);
	});

	it('does not offer a skin tone for an emoji that already contains one', () => {
		const offenders = everyEmoji()
			.filter(({ emoji, words }) => words.includes('HAS_TONE') && /[\u{1F3FB}-\u{1F3FF}]/u.test(emoji))
			.map(({ emoji }) => emoji);
		expect(offenders).toEqual([]);
	});
});
