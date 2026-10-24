// The Plural-Forms of every catalogue (translations/plural-forms.json), checked against the plural rules of the Unicode
// CLDR, which are read independently here: for every whole number from 0 to 2000 the catalogue's formula must pick
// a different form exactly where CLDR picks a different category, in the same order. (Fractions and numbers
// of a million or more are not looked at: the extension has no plural messages yet, so this is the table
// for when it gets some.)
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MANUAL, ORDER, categoryOf, cldrKey, formulaFor } from '../../translations/tools/plural-forms.mjs';
import { readCatalogue } from '../support/po.js';
import { EXTENSION_DIR, METADATA } from '../support/paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const LOCALE_DIR = path.join(EXTENSION_DIR, 'locale');
const table = JSON.parse(readFileSync(path.join(ROOT, 'translations', 'plural-forms.json'), 'utf8'));
const catalogues = readdirSync(LOCALE_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
const NUMBERS = Array.from({ length: 2001 }, (_, n) => n);

/** The index a `Plural-Forms` header value gives to a number, as gettext computes it. */
function indexer(header) {
	const [, nplurals, expression] = /^nplurals=(\d+); plural=(.+);$/.exec(header);
	if (!/^[n0-9%!=<>&|?:() +-]+$/.test(expression)) {
		throw new Error(`Not a plural expression: ${expression}`);
	}
	// (Only ever the table's own text, checked just above.)
	const calculate = new Function('n', `return Number(${expression});`);
	return { nplurals: Number(nplurals), of: (n) => calculate(n) };
}

describe('the plural forms table', () => {
	it('has an entry for every catalogue, and for nothing else', () => {
		expect(Object.keys(table.forms).sort()).toEqual(catalogues);
	});

	it.each(catalogues)('%s is in every catalogue header as the table says', (name) => {
		expect(
			readCatalogue(path.join(LOCALE_DIR, name, 'LC_MESSAGES', `${METADATA['gettext-domain']}.po`)).header[
				'Plural-Forms'
			],
		).toBe(table.forms[name]);
	});

	it.each(catalogues.filter((name) => !MANUAL[name]))('%s agrees with the CLDR plural rules for 0 to 2000', (name) => {
		const { nplurals, of } = indexer(table.forms[name]);
		const categories = NUMBERS.map((n) => categoryOf(cldrKey(name), n));
		// one form per category that whole numbers use, in the order of CLDR's categories
		const used = ORDER.filter((category) => categories.includes(category));
		expect(nplurals).toBe(used.length);
		const wrong = NUMBERS.filter((n, i) => of(n) !== used.indexOf(categories[i]));
		expect(wrong).toEqual([]);
	});

	it.each(catalogues.filter((name) => !MANUAL[name]))('%s is what the generator makes from the CLDR rules', (name) => {
		expect(table.forms[name]).toBe(formulaFor(cldrKey(name)));
	});

	it('has no CLDR rules for the languages it sets by hand, which say why', () => {
		for (const [name, entry] of Object.entries(MANUAL)) {
			expect(table.forms[name], name).toBe(entry.forms);
			expect(entry.why.length, name).toBeGreaterThan(20);
		}
	});
});
