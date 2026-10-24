// Writes the names and keywords of the emojis in many languages, from the Unicode CLDR annotations
// (`cldr-annotations-full` for the emojis themselves, `cldr-annotations-derived-full` for the flags, keycaps and
// other emojis CLDR names by a rule), to dist/extension/data/names/<language>.js: the data the search and the
// hover label use when the user's language is not English.
//
// Usage: npm run build:ts && node translations/tools/names.mjs [COMPILED_DIR]    (default: dist/extension)
//
// Each module holds one text per emoji of the table, in the order of the table: `name|keyword|keyword`, or an
// empty text where CLDR has nothing for that emoji. Unicode's licence goes with the data.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NODE_MODULES = path.join(ROOT, 'node_modules');
const MAIN = 'cldr-annotations-full';
const DERIVED = 'cldr-annotations-derived-full';

/**
 * A language that has no parent ships if CLDR names at least this share of our emojis. A regional variant (fr-CA,
 * de-CH...) only says what differs from its parent, so it ships if the parent does and it names anything at all.
 */
export const MINIMUM_SHARE = 0.5;

/** Fewer languages than this means that something is wrong with the data (CLDR 49 gives 126), not that it is small. */
export const MINIMUM_LANGUAGES = 100;

const VARIATION_SELECTOR = /\uFE0F/g;
/** An emoji with or without the invisible selector that asks for its picture, which CLDR and our table do not agree on. */
const plain = (emoji) => emoji.replace(VARIATION_SELECTOR, '');

/**
 * The CLDR annotations of a language, or of several (a later one wins), by emoji: `{ [emoji]: { tts, default } }`
 * as the JSON files give them.
 */
export function indexAnnotations(...sources) {
	const index = new Map();
	for (const source of sources) {
		for (const [emoji, annotation] of Object.entries(source)) {
			index.set(plain(emoji), annotation);
		}
	}
	return index;
}

/**
 * The text for each emoji of `characters`: its name, then its keywords, separated by `|` (none of CLDR's contain
 * one), without repeats; empty if CLDR has nothing for it.
 */
export function entriesFor(characters, index) {
	return characters.map((emoji) => {
		const annotation = index.get(plain(emoji));
		return annotation ? [...new Set([...(annotation.tts ?? []), ...(annotation.default ?? [])])].join('|') : '';
	});
}

const named = (entries) => entries.filter((entry) => entry !== '').length;

/** Whether a language has enough of the emojis to be worth shipping, as a variant of a language that ships or on its own. */
export function isShipped(entries, hasShippedParent = false) {
	return hasShippedParent ? named(entries) > 0 : named(entries) >= entries.length * MINIMUM_SHARE;
}

/**
 * The language that CLDR's locale inherits from, or null for none: what its supplemental data says (`und` is none),
 * and otherwise the locale without its last subtag (zh-Hant-HK inherits from zh-Hant, fr-CA from fr).
 */
export function parentOf(language, parentLocales) {
	const parent =
		parentLocales[language] ?? (language.includes('-') ? language.slice(0, language.lastIndexOf('-')) : 'und');
	return parent === 'und' || parent === 'root' ? null : parent;
}

/** The text of the module of a language: its parent (the language to take the emojis it does not name from) and its entries. */
export function moduleSource(entries, header, parent = null) {
	// One emoji to a line, as a reviewer expects of code that is not minified.
	return `// ${header}\nexport const parent = ${JSON.stringify(parent)};\nexport default [\n${entries.map((entry) => JSON.stringify(entry)).join(',\n')}\n];\n`;
}

/**
 * The annotations of a language in a package. The main package has every language that is listed from it; the
 * derived one lacks some, which is fine, but a file that is not as expected is not: a layout that CLDR changed
 * must stop the build, not ship a package without names.
 */
function annotationsOf(directory, property, language, { mayLackLanguage }) {
	const file = path.join(
		NODE_MODULES,
		directory,
		directory.endsWith('derived-full') ? 'annotationsDerived' : 'annotations',
		language,
		'annotations.json',
	);
	try {
		// (A few languages have a file with an identity and no annotations at all.)
		return JSON.parse(readFileSync(file, 'utf8'))[property].annotations ?? {};
	} catch (error) {
		if (mayLackLanguage && error.code === 'ENOENT') {
			return {};
		}
		throw error;
	}
}

const versionOf = (directory) =>
	JSON.parse(readFileSync(path.join(NODE_MODULES, directory, 'package.json'), 'utf8')).version;

/** The languages that are not our emojis' own: the table is in English. */
const isEnglish = (language) => language === 'en' || language.startsWith('en-');

/**
 * Writes the module of every language CLDR has enough of, in `outDir` (emptied first), with the licence.
 * A regional variant is written as it is in CLDR, with the language it inherits from named in its module, so that
 * the extension takes what the variant does not name from the parent. Returns the languages written, with how
 * many emojis each names, and the ones left out.
 */
export function generate(characters, outDir) {
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const header = `Generated by translations/tools/names.mjs from ${MAIN} ${versionOf(MAIN)} and ${DERIVED} ${versionOf(DERIVED)} of the Unicode CLDR (see UNICODE-LICENSE.txt).`;
	const parentLocales = JSON.parse(
		readFileSync(path.join(NODE_MODULES, 'cldr-core', 'supplemental', 'parentLocales.json'), 'utf8'),
	).supplemental.parentLocales.parentLocale;
	const languages = readdirSync(path.join(NODE_MODULES, MAIN, 'annotations'))
		.filter((language) => language !== 'und' && !isEnglish(language))
		.sort();
	const entriesOf = new Map(
		languages.map((language) => [
			language,
			entriesFor(
				characters,
				indexAnnotations(
					annotationsOf(DERIVED, 'annotationsDerived', language, { mayLackLanguage: true }),
					annotationsOf(MAIN, 'annotations', language, { mayLackLanguage: false }),
				),
			),
		]),
	);
	const written = new Map();
	/** Decides a language after its parent (which is why this is recursive), once. */
	const decide = (language) => {
		if (!written.has(language)) {
			const entries = entriesOf.get(language);
			const parent = parentOf(language, parentLocales);
			const hasShippedParent = parent !== null && entriesOf.has(parent) && decide(parent) !== null;
			written.set(
				language,
				isShipped(entries, hasShippedParent)
					? { language, named: named(entries), parent: hasShippedParent ? parent : null }
					: null,
			);
		}
		return written.get(language);
	};
	languages.forEach(decide);
	for (const { language, parent } of [...written.values()].filter((entry) => entry !== null)) {
		writeFileSync(path.join(outDir, `${language}.js`), moduleSource(entriesOf.get(language), header, parent));
	}
	copyFileSync(path.join(NODE_MODULES, MAIN, 'LICENSE'), path.join(outDir, 'UNICODE-LICENSE.txt'));
	const all = [...written.values()];
	return {
		written: all.filter((entry) => entry !== null),
		skipped: languages.filter((language) => written.get(language) === null),
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const compiled = path.join(path.resolve(process.argv[2] ?? path.join(ROOT, 'dist', 'extension')), 'data');
	const { EMOJIS_CHARACTERS } = await import(pathToFileURL(path.join(compiled, 'emojisCharacters.js')).href);
	const { written, skipped } = generate(EMOJIS_CHARACTERS.flat(), path.join(compiled, 'names'));
	if (written.length < MINIMUM_LANGUAGES) {
		console.error(
			`Only ${written.length} languages have emoji names (at least ${MINIMUM_LANGUAGES} expected): is the CLDR data as it was?`,
		);
		process.exit(1);
	}
	console.log(
		`Wrote the emoji names of ${written.length} languages; ${skipped.length} left out (too few: ${skipped.join(' ')})`,
	);
}
