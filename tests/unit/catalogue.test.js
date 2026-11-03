import { describe, expect, it } from 'vitest';

import { buildCatalogue } from '../../src/lib/catalogue.ts';
import { EMOJIS_CHARACTERS } from '../../src/data/emojisCharacters.ts';
import { EMOJIS_KEYWORDS } from '../../src/data/emojisKeywords.ts';

describe('buildCatalogue', () => {
	it('pairs each character with its keywords, category by category', () => {
		const catalogue = buildCatalogue([['a', 'b'], ['c']], [[['alpha', 'first'], ['beta']], [['gamma', 'HAS_TONE']]]);
		expect(catalogue.map((category) => category.map((emoji) => [emoji.baseCharacter, emoji.keywords]))).toEqual([
			[
				['a', ['alpha', 'first']],
				['b', ['beta']],
			],
			[['c', ['gamma', 'HAS_TONE']]],
		]);
		expect(catalogue[1][0].canHaveTone).toBe(true);
	});

	it.each([
		['more emojis than keyword groups', [['a', 'b']], [[['alpha']]], 'Category 0 has 2 emojis but 1 keyword groups'],
		[
			'more keyword groups than emojis',
			[['a']],
			[[['alpha'], ['beta']]],
			'Category 0 has 1 emojis but 2 keyword groups',
		],
		[
			'more categories than keyword categories',
			[['a'], ['b']],
			[[['alpha']]],
			'2 categories of emojis but 1 of keywords',
		],
		[
			'more keyword categories than categories',
			[['a']],
			[[['alpha']], [['beta']]],
			'1 categories of emojis but 2 of keywords',
		],
	])('refuses tables that do not match: %s', (name, characters, keywords, message) => {
		let error;
		try {
			buildCatalogue(characters, keywords);
		} catch (thrown) {
			error = thrown;
		}
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe(message);
	});

	it('builds the real catalogue from the real tables', () => {
		const catalogue = buildCatalogue(EMOJIS_CHARACTERS, EMOJIS_KEYWORDS);
		expect(catalogue).toHaveLength(9);
		expect(catalogue.map((category) => category.length)).toEqual(EMOJIS_CHARACTERS.map((category) => category.length));
		expect(catalogue[0][0].baseCharacter).toBe('😀');
	});
});
