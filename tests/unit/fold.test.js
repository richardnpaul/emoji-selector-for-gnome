import { describe, expect, it } from 'vitest';

import { fold } from '../../src/lib/fold.ts';

describe('fold', () => {
	it('lower-cases', () => {
		expect(fold('Grinning FACE')).toBe('grinning face');
	});

	it('leaves out the accents, so that "cafe" finds "café"', () => {
		expect(fold('Café')).toBe('cafe');
		expect(fold('piñata')).toBe('pinata');
		expect(fold('Ελληνικά ά')).toBe('ελληνικα α');
		expect(fold('Ёж й')).toBe('еж и');
	});

	it('reads a decomposed accent like the composed one', () => {
		expect(fold('cafe\u0301')).toBe(fold('caf\u00E9'));
	});

	it('turns the dotted Turkish capital into a plain i', () => {
		expect(fold('İstanbul')).toBe('istanbul');
	});

	it('keeps the marks that make letters of other scripts', () => {
		expect(fold('हिंदी')).toBe('हिंदी');
		expect(fold('ภาษาไทย')).toBe('ภาษาไทย');
		expect(fold('مرحبا')).toBe('مرحبا');
	});

	it('keeps the letters that are not an accented one', () => {
		expect(fold('straße ø đ')).toBe('straße ø đ');
	});

	it('reads the spaces that keep a line together, which French puts before a colon, as plain spaces', () => {
		expect(fold('drapeau\u202F: France')).toBe('drapeau : france');
		expect(fold('drapeau\u00A0: France')).toBe('drapeau : france');
		expect(fold('a\u3000b')).toBe('a b');
	});

	it('leaves an empty text empty', () => {
		expect(fold('')).toBe('');
	});
});
