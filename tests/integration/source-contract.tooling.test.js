// Static checks over the shipped sources. They pin properties that should never regress
// silently: the extension has no way to run programs, reach the network or touch files, and
// the code and the GSettings schema agree on every key.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXTENSION_DIR, METADATA } from '../support/paths.js';
import { parseSchema } from '../support/fakes/settings.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const SRC = path.join(ROOT, 'src');
const read = (file) => readFileSync(path.join(SRC, file), 'utf8');

/** Every TypeScript file below src/, except the emoji tables (data only). */
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
	);
const sourceFiles = walk(SRC)
	.map((file) => path.relative(SRC, file))
	.filter((file) => file.endsWith('.ts') && !file.startsWith('data/'))
	.sort();

/** Source with comments removed, so a word in a comment cannot trip or mask a check. */
const code = (file) =>
	read(file)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/(?<![:'"])\/\/.*$/gm, '');

describe('capabilities the extension must not have', () => {
	const FORBIDDEN = [
		['running programs', /GLib\.spawn|Gio\.Subprocess|Gio\.SubprocessLauncher|misc\/util|Util\.spawn|\bpkexec\b/],
		['evaluating code', /\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(|\bsetTimeout\s*\(\s*['"`]/],
		['network access', /\bSoup\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|Gio\.SocketClient|Gio\.NetworkMonitor/],
		['file access', /Gio\.File\b|GLib\.file_|GLib\.mkdir|GLib\.build_filenamev|Gio\.FileInputStream/],
		['D-Bus access', /Gio\.DBus|DBusProxy|DBusExportedObject/],
		['forced disposal', /run_dispose/],
		['process control', /\bsystem\b\s*\.\s*exit|from 'system'/],
	];

	// Negative controls: each pattern must catch a typical offender, or the check proves nothing.
	const OFFENDERS = {
		'running programs': [
			'GLib.spawn_command_line_async("ls")',
			'new Gio.Subprocess({argv: []})',
			"import * as Util from 'resource:///org/gnome/shell/misc/util.js'",
		],
		'evaluating code': ['eval(text)', 'new Function("return 1")', 'setTimeout("run()", 5)'],
		'network access': ['new Soup.Session()', 'fetch(url)', 'new XMLHttpRequest()'],
		'file access': ['Gio.File.new_for_path(p)', 'GLib.file_get_contents(p)'],
		'D-Bus access': ['Gio.DBus.session.call()', 'new Gio.DBusProxy()'],
		'forced disposal': ['obj.run_dispose()'],
		'process control': ["import { exit } from 'system'", 'system.exit(1)'],
	};

	it.each(FORBIDDEN)('recognises code for %s', (what, pattern) => {
		for (const sample of OFFENDERS[what]) {
			expect(pattern.test(sample), sample).toBe(true);
		}
	});

	it.each(FORBIDDEN)('has no code for %s', (what, pattern) => {
		const offenders = sourceFiles.filter((file) => pattern.test(code(file)));
		expect(offenders).toEqual([]);
	});

	it('only touches the clipboard from the clipboard module', () => {
		const users = sourceFiles.filter((file) => /St\.Clipboard|Clipboard\.get_default/.test(code(file)));
		expect(users).toEqual(['lib/clipboard.ts']);
		// (Which handlers call it, and that nothing else does, is checked by the journeys.)
	});

	it('declares its clipboard use in its description, as extensions.gnome.org requires', () => {
		expect(METADATA.description.toLowerCase()).toContain('clipboard');
	});
});

describe('settings schema', () => {
	const schema = parseSchema(path.join(EXTENSION_DIR, 'schemas', `${METADATA['settings-schema']}.gschema.xml`));
	const used = new Map();
	for (const file of sourceFiles) {
		for (const match of code(file).matchAll(
			/\b(?:get|set)_(?:int|string|boolean|strv)\('([^']+)'|\bonChanged\('([^']+)'|\.bind\(\s*'([^']+)'|\bKEYBINDING = '([^']+)'/g,
		)) {
			const key = match[1] ?? match[2] ?? match[3] ?? match[4];
			used.set(key, [...(used.get(key) ?? []), file]);
		}
	}

	it('defines every key the code uses', () => {
		expect([...used.keys()].filter((key) => !schema.keys.has(key))).toEqual([]);
	});

	it('has no key the code does not use', () => {
		expect([...schema.keys.keys()].filter((key) => !used.has(key))).toEqual([]);
	});

	it('uses each key with the getter and setter of its declared type', () => {
		const accessor = { s: 'string', i: 'int', b: 'boolean', as: 'strv' };
		const wrong = [];
		for (const file of sourceFiles) {
			for (const match of code(file).matchAll(/\b(?:get|set)_(int|string|boolean|strv)\('([^']+)'/g)) {
				if (accessor[schema.keys.get(match[2])?.type] !== match[1]) {
					wrong.push(`${file}: ${match[0]}`);
				}
			}
		}
		expect(wrong).toEqual([]);
	});
});

describe('metadata.json', () => {
	it('points at a public https repository', () => {
		expect(METADATA.url).toMatch(/^https:\/\/(github\.com|gitlab\.com|gitlab\.gnome\.org)\//);
	});

	it('describes the extension the same way on the About page and in the description', () => {
		const firstSentence = (text) => text.split('. ')[0].replace(/\.$/, '');
		expect(code('prefs.ts').replace(/\s+/g, ' ')).toContain(firstSentence(METADATA.description));
	});

	it('names the gettext domain of the translations, and leaves loading them to the Shell', () => {
		expect(METADATA['gettext-domain']).toBe('emoji-selector');
		const manual = sourceFiles.filter((file) => /initTranslations|Gettext\.domain|bindtextdomain/.test(code(file)));
		expect(manual).toEqual([]);
	});
});
