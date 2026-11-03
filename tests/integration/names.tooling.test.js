// The emoji names generated from the Unicode CLDR (translations/tools/names.mjs): the functions on small data, then the
// real thing on the real CLDR and the real table, since what ships is what this produces.
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EMOJIS_CHARACTERS } from '../../src/data/emojisCharacters.ts';
import { loadLocalNames, nameDataKeys } from '../../src/lib/localNames.ts';
import {
	MINIMUM_LANGUAGES,
	MINIMUM_SHARE,
	entriesFor,
	generate,
	indexAnnotations,
	isShipped,
	moduleSource,
	parentOf,
} from '../../translations/tools/names.mjs';
import { EXTENSION_DIR } from '../support/paths.js';

const EMOJIS = EMOJIS_CHARACTERS.flat();

describe('indexAnnotations', () => {
	it('finds an emoji with or without the selector that asks for its picture', () => {
		const index = indexAnnotations({ '☺️': { tts: ['smiling face'] } });
		expect(index.get('☺')).toEqual({ tts: ['smiling face'] });
	});

	it('lets a later source win', () => {
		const index = indexAnnotations({ a: { tts: ['first'] }, b: { tts: ['only'] } }, { a: { tts: ['second'] } });
		expect(index.get('a')).toEqual({ tts: ['second'] });
		expect(index.get('b')).toEqual({ tts: ['only'] });
	});

	it('is empty for nothing', () => {
		expect(indexAnnotations().size).toBe(0);
		expect(indexAnnotations({}).size).toBe(0);
	});
});

describe('entriesFor', () => {
	const index = indexAnnotations({
		'😀': { tts: ['visage rieur'], default: ['content', 'sourire'] },
		'☺️': { tts: ['visage souriant'], default: ['visage souriant', 'content'] },
		'🐈': { default: ['félin'] },
		'🐕': { tts: ['chien'] },
	});

	it('gives the name, then the keywords, in the order of the characters', () => {
		expect(entriesFor(['🐕', '😀'], index)).toEqual(['chien', 'visage rieur|content|sourire']);
	});

	it('gives each word once', () => {
		expect(entriesFor(['☺'], index)).toEqual(['visage souriant|content']);
	});

	it('copes with an annotation with only keywords, or only a name', () => {
		expect(entriesFor(['🐈', '🐕'], index)).toEqual(['félin', 'chien']);
	});

	it('gives nothing for an emoji CLDR does not know', () => {
		expect(entriesFor(['🦖', '😀'], index)).toEqual(['', 'visage rieur|content|sourire']);
	});

	it('is empty for no characters', () => {
		expect(entriesFor([], index)).toEqual([]);
	});
});

describe('isShipped', () => {
	it('wants at least half of the emojis named', () => {
		expect(MINIMUM_SHARE).toBe(0.5);
		expect(isShipped(['a', 'b', '', ''])).toBe(true);
		expect(isShipped(['a', '', '', ''])).toBe(false);
		expect(isShipped(['a', 'b', 'c', ''])).toBe(true);
		expect(isShipped([])).toBe(true);
	});

	it('wants only something of a variant of a language that ships', () => {
		expect(isShipped(['a', '', '', ''], true)).toBe(true);
		expect(isShipped(['', '', '', ''], true)).toBe(false);
		expect(isShipped([], true)).toBe(false);
	});
});

describe('parentOf', () => {
	const PARENTS = { 'zh-Hant': 'und', 'es-MX': 'es-419', 'sr-Latn': 'root' };

	it.each([
		['fr-CA', 'fr'],
		['zh-Hant-HK', 'zh-Hant'],
		['pt-PT', 'pt'],
		['es-MX', 'es-419'],
		['zh-Hant', null],
		['sr-Latn', null],
		['fr', null],
	])('names the language %s inherits from: %s', (language, parent) => {
		expect(parentOf(language, PARENTS)).toBe(parent);
	});
});

describe('moduleSource', () => {
	it('is a module whose default export is the entries, under a comment', async () => {
		const entries = ['a|b', '', 'c "quoted" \\ é|d'];
		const source = moduleSource(entries, 'Generated, see the licence.');
		expect(source.startsWith('// Generated, see the licence.\n')).toBe(true);
		const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
		expect(module.default).toEqual(entries);
		// (Not read back: the module loader of the tests turns a null export into undefined.)
		expect(source).toContain('export const parent = null;\n');
	});

	it('says which language it inherits from', async () => {
		const source = moduleSource(['a'], 'Header.', 'fr');
		const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
		expect(module.parent).toBe('fr');
		expect(module.default).toEqual(['a']);
	});
});

describe('the generated data', () => {
	let out;
	let result;
	const read = async (language) => (await import(pathToFileURL(path.join(out, `${language}.js`)).href)).default;

	beforeAll(() => {
		out = path.join(mkdtempSync(path.join(os.tmpdir(), 'emoji-names-')), 'names');
		result = generate(EMOJIS, out);
	});
	afterAll(() => rmSync(path.dirname(out), { recursive: true, force: true }));

	it('has a module for each language written, and the licence of the data', () => {
		expect(readdirSync(out).sort()).toEqual(
			[...result.written.map((entry) => `${entry.language}.js`), 'UNICODE-LICENSE.txt'].sort(),
		);
		expect(readFileSync(path.join(out, 'UNICODE-LICENSE.txt'), 'utf8')).toContain('Permission is hereby granted');
	});

	it('writes over what was there, and leaves nothing of it', () => {
		expect(generate(EMOJIS, out).written).toEqual(result.written);
		expect(readdirSync(out)).toHaveLength(result.written.length + 1);
	});

	it('has a text for every emoji of the table, in the order of the table', async () => {
		for (const { language } of result.written) {
			expect(await read(language), language).toHaveLength(EMOJIS.length);
		}
	});

	it('names at least half of the emojis in every language that inherits from none, most of them in nearly all', () => {
		const alone = result.written.filter((entry) => entry.parent === null);
		for (const { language, named } of alone) {
			expect(named, language).toBeGreaterThanOrEqual(EMOJIS.length * MINIMUM_SHARE);
		}
		expect(alone.filter((entry) => entry.named >= EMOJIS.length - 10).length).toBeGreaterThan(80);
	});

	it('has a variant inherit from a language that is written, and from one only', () => {
		const written = new Map(result.written.map((entry) => [entry.language, entry]));
		const variants = result.written.filter((entry) => entry.parent !== null);
		expect(variants.length).toBeGreaterThan(10);
		for (const { language, parent, named } of variants) {
			expect(written.has(parent), `${language} from ${parent}`).toBe(true);
			expect(named, language).toBeGreaterThan(0);
		}
		const parentOfLanguage = (language) => written.get(language)?.parent;
		expect(parentOfLanguage('fr-CA')).toBe('fr');
		expect(parentOfLanguage('de-CH')).toBe('de');
		expect(parentOfLanguage('pt-PT')).toBe('pt');
		expect(parentOfLanguage('nn')).toBe('no');
		expect(parentOfLanguage('zh-Hant')).toBeNull();
		expect(parentOfLanguage('zh-Hant-HK')).toBe('zh-Hant');
		expect(parentOfLanguage('es-MX')).toBe('es-419');
		expect(parentOfLanguage('es-419')).toBe('es');
	});

	it('gives a user of a variant every emoji that the language it inherits from names', async () => {
		const directory = pathToFileURL(`${out}/`).href;
		const importNameData = (key) => import(`${directory}${key}.js`);
		const named = (data) => data.filter((entry) => entry !== '').length;
		for (const [locale, parent] of [
			['fr_CA', 'fr'],
			['pt_PT', 'pt'],
			['zh_HK', 'zh-Hant'],
			['nn_NO', 'no'],
			['es_MX', 'es'],
		]) {
			const loaded = await loadLocalNames([locale], importNameData);
			expect(named(loaded.data), locale).toBeGreaterThanOrEqual(named(await read(parent)));
		}
	});

	it('has no module of English, in which the emojis are named already', () => {
		expect(result.written.filter((entry) => entry.language === 'en' || entry.language.startsWith('en-'))).toEqual([]);
		expect(readdirSync(out).filter((name) => name.startsWith('en'))).toEqual([]);
	});

	it('names the flags, the keycaps and the other emojis that CLDR names by a rule, as well as the rest', async () => {
		const french = await read('fr');
		const at = (emoji) => french[EMOJIS.indexOf(emoji)];
		expect(at('🇫🇷')).toMatch(/^drapeau\u202F: France/);
		expect(at('#️⃣')).toMatch(/^touches\u202F: #/);
		expect(at('🐈')).toMatch(/^chat\|/);
	});

	it('has the emoji the order of the table puts first at the start', async () => {
		expect(EMOJIS[0]).toBe('😀');
		expect((await read('de'))[0]).toMatch(/^strahlendes Gesicht|^grinsendes Gesicht/);
	});

	it('ships the languages and scripts with a locale of their own, and not the ones with too few names', () => {
		const written = result.written.map((entry) => entry.language);
		for (const language of [
			'de',
			'fr',
			'ja',
			'ar',
			'he',
			'pt',
			'pt-PT',
			'zh',
			'zh-Hant',
			'zh-Hant-HK',
			'sr',
			'sr-Latn',
			'es',
			'fr-CA',
		]) {
			expect(written, language).toContain(language);
		}
		for (const language of ['ccp', 'oc', 'sa']) {
			expect(result.skipped, language).toContain(language);
		}
	});

	it('has no text that would be taken for two', async () => {
		for (const { language } of result.written) {
			for (const entry of await read(language)) {
				expect(entry, language).not.toMatch(/\|\||^\||\|$/);
			}
		}
	});

	it('is small enough to ship: under 3.5 MB once compressed, for the whole package is limited to 5 MiB', () => {
		let total = 0;
		for (const name of readdirSync(out)) {
			total += gzipSync(readFileSync(path.join(out, name))).length;
		}
		expect(total).toBeLessThan(3.5 * 1024 * 1024);
	});

	describe('for each language of the interface', () => {
		const LOCALES = readdirSync(path.join(EXTENSION_DIR, 'locale'), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		/** The locales of a user of a catalogue, as GLib lists them. */
		const namesOf = (locale) => [locale, locale.split('_')[0]];
		/** No CLDR data to speak of for these: their users search in English (see docs/language-support-plan.md). */
		const WITHOUT_NAMES = ['ckb', 'eo', 'ht', 'ku', 'lg', 'ln', 'mg', 'oc', 'pap', 'sm', 'st', 'su', 'tpi'];

		it('has emoji names, except for the ones it is known to lack', () => {
			const written = new Set(result.written.map((entry) => entry.language));
			const without = LOCALES.filter((locale) => !nameDataKeys(namesOf(locale)).some((key) => written.has(key)));
			expect(without).toEqual(WITHOUT_NAMES);
		});
	});
});

describe('the command', () => {
	const COMMAND = path.resolve(EXTENSION_DIR, '..', 'translations/tools/names.mjs');
	let compiled;

	/** A compiled extension holding a table of these characters. */
	function compiledWith(characters) {
		compiled = mkdtempSync(path.join(os.tmpdir(), 'emoji-names-cmd-'));
		mkdirSync(path.join(compiled, 'data'));
		writeFileSync(
			path.join(compiled, 'data', 'emojisCharacters.js'),
			`export const EMOJIS_CHARACTERS = [${JSON.stringify(characters)}];\n`,
		);
		return spawnSync('node', [COMMAND, compiled], { encoding: 'utf8' });
	}
	afterAll(() => rmSync(compiled, { recursive: true, force: true }));

	it('writes the data next to the table it is given, and says how many languages', () => {
		const result = compiledWith(['😀', '🐈', '☕']);
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/^Wrote the emoji names of 1\d\d languages; /);
		expect(existsSync(path.join(compiled, 'data', 'names', 'fr.js'))).toBe(true);
		expect(existsSync(path.join(compiled, 'data', 'names', 'UNICODE-LICENSE.txt'))).toBe(true);
	});

	it('fails, rather than ship a package without names, when almost no language names the emojis', () => {
		expect(MINIMUM_LANGUAGES).toBe(100);
		const result = compiledWith(['not an emoji', 'neither is this']);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Only 0 languages have emoji names (at least 100 expected)');
	});
});
