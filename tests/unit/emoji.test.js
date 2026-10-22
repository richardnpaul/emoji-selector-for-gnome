import { describe, expect, it } from 'vitest';

import { Emoji } from '../../src/lib/emoji.ts';

const LIGHT = '\u{1F3FB}';
const MEDIUM_LIGHT = '\u{1F3FC}';
const MEDIUM = '\u{1F3FD}';
const MEDIUM_DARK = '\u{1F3FE}';
const DARK = '\u{1F3FF}';
const WOMAN_SIGN = '‍♀️';
const MAN_SIGN = '‍♂️';

describe('Emoji', () => {
	describe('what it is', () => {
		it('keeps the base character and the keywords, the first of which is its name', () => {
			const emoji = new Emoji('😀', ['grinning face', 'grin']);
			expect(emoji.baseCharacter).toBe('😀');
			expect(emoji.keywords).toEqual(['grinning face', 'grin']);
			expect(emoji.name).toBe('grinning face');
		});

		it('has an empty name when it has no keywords', () => {
			expect(new Emoji('', []).name).toBe('');
		});

		it.each([
			[[], [false, false, false]],
			[
				['x', 'y'],
				[false, false, false],
			],
			[
				['x', 'HAS_TONE'],
				[true, false, false],
			],
			[
				['HAS_GENDER', 'x'],
				[false, true, false],
			],
			[
				['x', 'IS_GENDERED'],
				[false, false, true],
			],
			[
				['HAS_TONE', 'HAS_GENDER'],
				[true, true, false],
			],
			[
				['IS_GENDERED', 'HAS_TONE'],
				[true, false, true],
			],
			[
				['HAS_GENDER', 'IS_GENDERED', 'HAS_TONE'],
				[true, true, true],
			],
			[
				['has_tone', 'Has_Gender', 'is_gendered'],
				[false, false, false],
			],
		])('derives what it supports from the markers of %j', (keywords, [tone, gender, gendered]) => {
			const emoji = new Emoji('x', keywords);
			expect([emoji.canHaveTone, emoji.canHaveGender, emoji.isGendered]).toEqual([tone, gender, gendered]);
		});
	});

	describe('tagged (with the chosen skin tone and gender)', () => {
		const tagged = (character, keywords, tone = 0, gender = 0) => new Emoji(character, keywords).tagged(tone, gender);

		it('returns an untagged emoji unchanged, whatever the choice', () => {
			expect(tagged('😀', ['grinning face'], 3, 2)).toBe('😀');
		});

		it.each([
			[0, ''],
			[1, LIGHT],
			[2, MEDIUM_LIGHT],
			[3, MEDIUM],
			[4, MEDIUM_DARK],
			[5, DARK],
		])('appends skin tone %i to a tonable emoji', (tone, modifier) => {
			expect(tagged('👍', ['thumbs up', 'HAS_TONE'], tone)).toBe(`👍${modifier}`);
		});

		it.each([
			[0, ''],
			[1, WOMAN_SIGN],
			[2, MAN_SIGN],
		])('appends gender %i to a genderable emoji', (gender, sign) => {
			expect(tagged('🏃', ['person running', 'HAS_GENDER'], 0, gender)).toBe(`🏃${sign}`);
		});

		it('ignores a tone or gender it does not know', () => {
			expect(tagged('👍', ['HAS_TONE', 'HAS_GENDER'], 6, 3)).toBe('👍');
		});

		it('applies the skin tone before the gender', () => {
			expect(tagged('🏃', ['HAS_TONE', 'HAS_GENDER'], 2, 1)).toBe(`🏃${MEDIUM_LIGHT}${WOMAN_SIGN}`);
		});

		it('ignores the gender for an emoji that cannot take one, and the tone likewise', () => {
			expect(tagged('👍', ['HAS_TONE'], 0, 1)).toBe('👍');
			expect(tagged('🏃', ['HAS_GENDER'], 5, 0)).toBe('🏃');
		});

		describe('already-gendered emoji (the tone goes right after the person)', () => {
			const gendered = (character, extra = []) => tagged(character, ['IS_GENDERED', 'HAS_TONE', ...extra], 4);

			it('after the woman', () => {
				expect(gendered('👩‍⚕️')).toBe(`👩${MEDIUM_DARK}‍⚕️`);
			});

			it('after the man', () => {
				expect(gendered('👨‍⚕️')).toBe(`👨${MEDIUM_DARK}‍⚕️`);
			});

			it('only after the first person, and the woman wins when both are present', () => {
				expect(gendered('👩‍❤️‍👨')).toBe(`👩${MEDIUM_DARK}‍❤️‍👨`);
				expect(gendered('👩‍🤝‍👩')).toBe(`👩${MEDIUM_DARK}‍🤝‍👩`);
			});

			it('leaves the emoji alone when it contains neither', () => {
				expect(gendered('🧑‍⚕️')).toBe('🧑‍⚕️');
			});

			it('can still take a trailing gender sign as well', () => {
				expect(tagged('👨‍⚕️', ['IS_GENDERED', 'HAS_TONE', 'HAS_GENDER'], 4, 2)).toBe(`👨${MEDIUM_DARK}‍⚕️${MAN_SIGN}`);
			});

			it('does not touch the tone at all when the emoji is gendered but not tonable', () => {
				expect(tagged('👨‍⚕️', ['IS_GENDERED'], 4)).toBe('👨‍⚕️');
			});
		});
	});

	describe('isUsedAs (recognising an emoji that was copied with its tags)', () => {
		const used = (character, keywords, stored) => new Emoji(character, keywords).isUsedAs(stored);

		it('recognises the plain emoji, and only that', () => {
			expect(used('😀', [], '😀')).toBe(true);
			expect(used('😀', [], '😁')).toBe(false);
			expect(used('😀', [], '')).toBe(false);
		});

		it.each([LIGHT, MEDIUM_LIGHT, MEDIUM, MEDIUM_DARK, DARK])(
			'recognises a tonable emoji with skin tone %#',
			(tone) => {
				expect(used('👍', ['HAS_TONE'], `👍${tone}`)).toBe(true);
			},
		);

		it('does not accept a skin tone on an emoji that cannot take one', () => {
			expect(used('👍', [], `👍${LIGHT}`)).toBe(false);
		});

		it.each([WOMAN_SIGN, MAN_SIGN])('recognises a genderable emoji with gender sign %#', (sign) => {
			expect(used('🏃', ['HAS_GENDER'], `🏃${sign}`)).toBe(true);
		});

		it('does not accept a gender sign on an emoji that cannot take one', () => {
			expect(used('🏃', [], `🏃${WOMAN_SIGN}`)).toBe(false);
		});

		it('recognises both tags together, the sign coming last', () => {
			expect(used('🏃', ['HAS_TONE', 'HAS_GENDER'], `🏃${MEDIUM}${MAN_SIGN}`)).toBe(true);
			expect(used('🏃', ['HAS_TONE', 'HAS_GENDER'], `🏃${MEDIUM}`)).toBe(true);
			expect(used('🏃', ['HAS_TONE', 'HAS_GENDER'], `🏃${MAN_SIGN}`)).toBe(true);
		});

		it('recognises an already-gendered emoji with the tone after the person', () => {
			expect(used('👩‍⚕️', ['IS_GENDERED', 'HAS_TONE'], `👩${DARK}‍⚕️`)).toBe(true);
			expect(used('👩‍⚕️', ['IS_GENDERED', 'HAS_TONE'], '👩‍⚕️')).toBe(true);
			expect(used('👩‍⚕️', ['IS_GENDERED', 'HAS_TONE'], '👨‍⚕️')).toBe(false);
		});

		it('only ignores a gender sign at the very end, where tagged() puts it', () => {
			// A sign in the middle belongs to a different, longer sequence.
			expect(used('ab', ['HAS_GENDER'], `a${WOMAN_SIGN}b`)).toBe(false);
			expect(used('ab', ['HAS_GENDER'], `ab${WOMAN_SIGN}`)).toBe(true);
		});

		it('does not mistake a different emoji that merely ends in a gender sign', () => {
			expect(used('🧜', [], `🧜${WOMAN_SIGN}`)).toBe(false);
			expect(used('🧜‍♀️', [], `🧜${WOMAN_SIGN}`)).toBe(true);
			expect(used('🧜', ['HAS_GENDER'], `🧜${WOMAN_SIGN}`)).toBe(true);
		});
	});
});
