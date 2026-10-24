// Derives the `Plural-Forms` line of every catalogue from the plural rules of the Unicode CLDR (the
// `cldr-core` package), and writes it to translations/plural-forms.json and to each catalogue's header.
//
// Usage: node translations/tools/plural-forms.mjs
//
// gettext wants a C expression of `n`; CLDR has rules over several operands. For whole numbers (which is all
// a plural message gets here) the operands i and n are the number and v, w, f, t, c, e are 0, so each rule
// becomes a plain condition on n. One form per category that whole numbers from 0 to 2000 use, in CLDR's
// order (zero, one, two, few, many, other). Fractions, and numbers of a million and more (French and
// Spanish have a "many" for exact millions), are not distinguished.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RULES = JSON.parse(
	readFileSync(new URL('../../node_modules/cldr-core/supplemental/plurals.json', import.meta.url), 'utf8'),
).supplemental['plurals-type-cardinal'];

export const ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];
const TO = 2000;

/** Languages that CLDR has no plural rules for, so the forms are set by hand. */
export const MANUAL = {
	ht: {
		forms: 'nplurals=1; plural=0;',
		why: 'CLDR has no rules for Haitian Creole, which does not mark plurals on nouns',
	},
	mi: {
		forms: 'nplurals=1; plural=0;',
		why: 'CLDR has no rules for Māori, which marks number with a particle, not the noun',
	},
	oc: {
		forms: 'nplurals=2; plural=(n > 1);',
		why: 'CLDR has no rules for Occitan; the human catalogue had this, the rule of French (0 and 1 singular)',
	},
	rw: {
		forms: 'nplurals=1; plural=0;',
		why: 'CLDR has no rules for Kinyarwanda; no form of the extension needs more than one',
	},
	sm: {
		forms: 'nplurals=1; plural=0;',
		why: 'CLDR has no rules for Samoan, which marks number with a particle, not the noun',
	},
};

/** The key of a catalogue's language in CLDR (a catalogue for pt is European Portuguese, as pt_BR is Brazilian). */
export function cldrKey(name) {
	if (name === 'pt') {
		return 'pt-PT';
	}
	return name.startsWith('zh') ? 'zh' : name.split('_')[0];
}

/** `i = 1 and v = 0 or ...` as groups (or) of relations (and). */
function parse(text) {
	const condition = text.split('@')[0].trim();
	if (condition === '') {
		return null;
	}
	return condition.split(/\s+or\s+/).map((group) =>
		group.split(/\s+and\s+/).map((relation) => {
			const [, operand, mod, operator, list] = /^(\w)(?:\s*%\s*(\d+))?\s*(!=|=)\s*(.+)$/.exec(relation.trim());
			return {
				operand,
				mod: mod === undefined ? null : Number(mod),
				negate: operator === '!=',
				ranges: list.split(',').map((item) => {
					const [from, to] = item.trim().split('..').map(Number);
					return [from, to ?? from];
				}),
			};
		}),
	);
}

const PARSED = new Map();
function rulesOf(key) {
	if (!PARSED.has(key)) {
		const entries = Object.entries(RULES[key] ?? {}).map(([name, text]) => [
			name.replace('pluralRule-count-', ''),
			parse(text),
		]);
		PARSED.set(key, new Map(entries.filter(([, condition]) => condition !== null)));
	}
	return PARSED.get(key);
}

/** The value of an operand for a whole number: n and i are the number, the rest are 0. */
const operandValue = (operand, n) => (operand === 'n' || operand === 'i' ? n : 0);

function holds(relation, n) {
	const raw = operandValue(relation.operand, n);
	const x = relation.mod === null ? raw : raw % relation.mod;
	return relation.ranges.some(([from, to]) => x >= from && x <= to) !== relation.negate;
}

/** The CLDR category of a whole number in a language. */
export function categoryOf(key, n) {
	for (const [category, condition] of rulesOf(key)) {
		if (condition.some((group) => group.every((relation) => holds(relation, n)))) {
			return category;
		}
	}
	return 'other';
}

/** A relation on n as C, or true or false when it only involves operands that are 0 for whole numbers. */
function toC(relation) {
	if (relation.operand !== 'n' && relation.operand !== 'i') {
		return holds(relation, 0);
	}
	const x = relation.mod === null ? 'n' : `n%${relation.mod}`;
	const parts = relation.ranges.map(([from, to]) => {
		if (from === to) {
			return relation.negate ? `${x}!=${from}` : `${x}==${from}`;
		}
		return relation.negate ? `(${x}<${from} || ${x}>${to})` : `(${x}>=${from} && ${x}<=${to})`;
	});
	return parts.length === 1 ? parts[0] : parts.join(relation.negate ? ' && ' : ' || ');
}

/** The condition for a category as C (true when it always holds, false when never). */
function conditionC(condition) {
	const groups = [];
	for (const group of condition) {
		const relations = group.map(toC);
		if (relations.every((relation) => relation === true)) {
			return true;
		}
		if (!relations.includes(false)) {
			groups.push(
				relations
					.filter((relation) => relation !== true)
					.map((relation) => (relation.includes(' || ') && relations.length > 1 ? `(${relation})` : relation))
					.join(' && '),
			);
		}
	}
	return groups.length === 0 ? false : groups.join(' || ');
}

/** The `Plural-Forms` value for a language, from its CLDR rules. */
export function formulaFor(key) {
	const seen = new Set(Array.from({ length: TO + 1 }, (_, n) => categoryOf(key, n)));
	const used = ORDER.filter((category) => seen.has(category));
	if (used.length === 1) {
		return 'nplurals=1; plural=0;';
	}
	let chain = String(used.length - 1);
	for (let index = used.length - 2; index >= 0; index--) {
		chain = `${conditionC(rulesOf(key).get(used[index]))} ? ${index} : ${chain}`;
	}
	return `nplurals=${used.length}; plural=(${chain});`;
}

function main() {
	const locale = new URL('../../assets/locale/', import.meta.url);
	const names = readdirSync(locale, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	const forms = {};
	for (const name of names) {
		forms[name] = MANUAL[name]?.forms ?? formulaFor(cldrKey(name));
		const file = new URL(`${name}/LC_MESSAGES/emoji-selector.po`, locale);
		const text = readFileSync(file, 'utf8');
		const line = `"Plural-Forms: ${forms[name]}\\n"`;
		writeFileSync(
			file,
			/^"Plural-Forms: .*"$/m.test(text)
				? text.replace(/^"Plural-Forms: .*"$/m, line)
				: text.replace(/^("Content-Transfer-Encoding: .*"\n)/m, `$1${line}\n`),
		);
	}
	const about =
		'Derived from the Unicode CLDR plural rules by translations/tools/plural-forms.mjs (run it again to update this file ' +
		'and the headers); the few languages CLDR has no rules for are set by hand in that file, with the reason.';
	writeFileSync(new URL('../plural-forms.json', import.meta.url), JSON.stringify({ about, forms }, null, 2) + '\n');
	console.log(`Plural forms of ${names.length} catalogues written.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
