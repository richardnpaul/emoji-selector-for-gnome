// The translation catalogues in assets/locale: that each is named so a real user's locale finds it (proved with
// the real gettext), is complete when it is machine-made, keeps the placeholders of the messages, and has its
// origin recorded in translations/provenance.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readCatalogue, placeholders } from '../support/po.js';
import { EXTENSION_DIR, METADATA } from '../support/paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const LOCALE_DIR = path.join(EXTENSION_DIR, 'locale');
const DOMAIN = METADATA['gettext-domain'];
const PROVENANCE_FILE = path.join(ROOT, 'translations', 'provenance.json');

const catalogues = readdirSync(LOCALE_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
const poFile = (name) => path.join(LOCALE_DIR, name, 'LC_MESSAGES', `${DOMAIN}.po`);
const provenance = existsSync(PROVENANCE_FILE) ? JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8')) : null;

describe('catalogue names', () => {
	it('exist', () => {
		expect(catalogues.length).toBeGreaterThan(10);
	});

	it.each(catalogues)(
		'%s is a language, optionally with a territory, as glibc names locales (no script such as _Hans)',
		(name) => {
			expect(name).toMatch(/^[a-z]{2,3}(_[A-Z]{2})?$/);
		},
	);

	it.each(catalogues)('%s has its own name in its Language header', (name) => {
		expect(readCatalogue(poFile(name)).header.Language).toBe(name);
	});

	it.each(catalogues)('%s declares its plural forms', (name) => {
		expect(readCatalogue(poFile(name)).header['Plural-Forms']).toMatch(/^nplurals=\d+; plural=.+;$/);
	});
});

describe('catalogues are found by the locales of real users (real gettext)', () => {
	// [a locale installed in the dev container, the catalogue its users must get]
	const USERS = [
		['ar_EG.utf8', 'ar'],
		['de_AT.utf8', 'de'],
		['es_MX.utf8', 'es'],
		['es_AR.utf8', 'es'],
		['fr_CA.utf8', 'fr'],
		['he_IL.utf8', 'he'],
		['ja_JP.utf8', 'ja'],
		['pt_BR.utf8', 'pt_BR'],
		['zh_CN.utf8', 'zh_CN'],
	];

	/** A few messages the catalogue really translates (not fuzzy, not left as in English). */
	const translated = (name) =>
		readCatalogue(poFile(name))
			.entries.filter((entry) => !entry.fuzzy && entry.msgstr !== '' && entry.msgstr !== entry.msgid)
			.slice(0, 3);

	it.each(USERS)('a user of %s gets the catalogue %s', (locale, name) => {
		expect(existsSync(poFile(name)), `no catalogue ${name}`).toBe(true);
		const expected = translated(name);
		expect(expected.length).toBeGreaterThan(0);
		const result = spawnSync(
			'gjs',
			[
				'-m',
				path.join(ROOT, 'tests/integration/real/gettext-lookup.js'),
				LOCALE_DIR,
				DOMAIN,
				JSON.stringify(expected.map((entry) => entry.msgid)),
			],
			{ encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/tmp', LC_ALL: locale } },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout.trim().split('\n').at(-1))).toEqual(
			Object.fromEntries(expected.map((entry) => [entry.msgid, entry.msgstr])),
		);
	});

	it('has the real locales of these users in the dev container image', () => {
		const dockerfile = readFileSync(path.join(ROOT, '.devcontainer/Dockerfile'), 'utf8');
		const languages = [...new Set(USERS.map(([locale]) => locale.split('_')[0]))];
		expect(languages.filter((language) => !dockerfile.includes(`glibc-langpack-${language} `))).toEqual([]);
	});

	it('a user of a language without a catalogue gets the English messages', () => {
		const result = spawnSync(
			'gjs',
			['-m', path.join(ROOT, 'tests/integration/real/gettext-lookup.js'), LOCALE_DIR, DOMAIN, '["Layout"]'],
			{ encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/tmp', LC_ALL: 'C.utf8' } },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout.trim().split('\n').at(-1))).toEqual({ Layout: 'Layout' });
	});
});

describe('provenance', () => {
	it('is recorded in translations/provenance.json', () => {
		expect(provenance, 'translations/provenance.json is missing').not.toBeNull();
	});

	it('has an entry for every catalogue, and no entry for a catalogue that does not exist', () => {
		expect(Object.keys(provenance?.catalogues ?? {}).sort()).toEqual(catalogues);
	});

	it.each(catalogues)('%s says whether it is human or machine made, and its tier', (name) => {
		const entry = provenance?.catalogues[name];
		expect(['human', 'machine', 'merged'], name).toContain(entry?.origin);
		expect([1, 2, 3], name).toContain(entry?.tier);
	});
});

describe('merged catalogues keep the human work', () => {
	const merged = catalogues.filter((name) => provenance?.catalogues[name]?.origin === 'merged');
	const report = readFileSync(path.join(ROOT, 'translations', 'comparison.md'), 'utf8');
	/** The messages the report says it replaced in the human catalogue of a language. */
	const replaced = (name) =>
		report
			.split('\n')
			.map((line) => new RegExp('^- `' + name + '` "(.+?)": ".*" replaced by ').exec(line)?.[1])
			.filter((msgid) => msgid !== undefined)
			.sort();

	it('are the 13 that people wrote', () => {
		expect(merged).toEqual(['ar', 'cs', 'de', 'eo', 'es', 'fr', 'gl', 'it', 'nl', 'oc', 'pl', 'pt_BR', 'zh_CN']);
	});

	it.each(merged)('%s keeps every entry the human wrote, except those the comparison report lists', (name) => {
		const human = readCatalogue(path.join(ROOT, 'translations', 'human', `${name}.po`)).entries.filter(
			(entry) =>
				entry.msgstr !== '' && !entry.fuzzy && placeholders(entry.msgid).join() === placeholders(entry.msgstr).join(),
		);
		const now = new Map(readCatalogue(poFile(name)).entries.map((entry) => [entry.msgid, entry.msgstr]));
		const changed = human.filter((entry) => now.get(entry.msgid) !== entry.msgstr).map((entry) => entry.msgid);
		expect(changed.sort()).toEqual(replaced(name));
	});

	it.each(merged)('%s has both versions kept for comparison', (name) => {
		expect(existsSync(path.join(ROOT, 'translations', 'human', `${name}.po`))).toBe(true);
		expect(existsSync(path.join(ROOT, 'translations', 'machine', `${name}.po`))).toBe(true);
	});
});

describe('catalogue contents', () => {
	/** English words that are the same in another language (names and technical terms), for all and for one. */
	const sameAsEnglish = (name) =>
		new Set([...(provenance?.sameAsEnglish ?? []), ...(provenance?.catalogues[name]?.sameAsEnglish ?? [])]);

	it.each(catalogues)('%s keeps the placeholders of every message it translates', (name) => {
		const wrong = readCatalogue(poFile(name))
			.entries.filter((entry) => entry.msgstr !== '' && !entry.fuzzy)
			.filter((entry) => placeholders(entry.msgid).join() !== placeholders(entry.msgstr).join())
			.map((entry) => entry.msgid);
		expect(wrong).toEqual([]);
	});

	const complete = (name) => ['machine', 'merged'].includes(provenance?.catalogues[name]?.origin);

	it.each(catalogues.filter(complete))(
		'%s (machine made, or merged) is complete: nothing untranslated or fuzzy, nothing left in English by accident',
		(name) => {
			const { entries } = readCatalogue(poFile(name));
			expect(entries.filter((entry) => entry.msgstr === '').map((entry) => entry.msgid)).toEqual([]);
			expect(entries.filter((entry) => entry.fuzzy).map((entry) => entry.msgid)).toEqual([]);
			expect(
				entries
					.filter((entry) => entry.msgstr === entry.msgid && !sameAsEnglish(name).has(entry.msgid))
					.map((entry) => entry.msgid),
			).toEqual([]);
		},
	);

	it('has complete catalogues that cover every message of the template', () => {
		const template = readCatalogue(path.join(LOCALE_DIR, `${DOMAIN}.pot`)).entries.map((entry) => entry.msgid);
		for (const name of catalogues.filter(complete)) {
			expect(
				readCatalogue(poFile(name))
					.entries.map((entry) => entry.msgid)
					.sort(),
				name,
			).toEqual([...template].sort());
		}
	});
});
