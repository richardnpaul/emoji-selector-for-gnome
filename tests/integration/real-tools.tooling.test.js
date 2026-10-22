// Checks that run the REAL GNOME tooling (glib-compile-schemas, gettext, GTK4 under Xvfb)
// against the files that ship, so they do not depend on the fakes used elsewhere.
// These need the devcontainer's tools; a missing tool is a failure, not a skip.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import Clutter from '../support/gi/Clutter.js';
import GLib from '../support/gi/GLib.js';
import Meta from '../support/gi/Meta.js';
import Shell from '../support/gi/Shell.js';
import St from '../support/gi/St.js';
import EmojiSelectorExtension from '../../src/extension.ts';
import { Actor } from '../support/fakes/toolkit.js';
import { FakeSettings, parseSchema } from '../support/fakes/settings.js';
import { createSettings } from '../support/settings.js';
import { extensionState, main } from '../support/shell-state.js';
import { EXTENSION_DIR, METADATA } from '../support/paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const SCHEMA_DIR = path.join(EXTENSION_DIR, 'schemas');
const LOCALE_DIR = path.join(EXTENSION_DIR, 'locale');

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { encoding: 'utf8', ...options });
	if (result.error) {
		throw new Error(`Could not run ${command}: ${result.error.message}. Is the devcontainer toolchain installed?`);
	}
	return result;
}

const languages = () => readdirSync(LOCALE_DIR).filter((entry) => statSync(path.join(LOCALE_DIR, entry)).isDirectory());

describe('GSettings schema', () => {
	it('compiles with glib-compile-schemas --strict', () => {
		const result = run('glib-compile-schemas', ['--strict', '--dry-run', SCHEMA_DIR]);
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
	});

	it('follows the extensions.gnome.org naming rules and matches metadata.json', () => {
		const { schemaId } = parseSchema(path.join(SCHEMA_DIR, `${METADATA['settings-schema']}.gschema.xml`));
		expect(schemaId).toBe(METADATA['settings-schema']);
		expect(schemaId).toMatch(/^org\.gnome\.shell\.extensions\./);
		const xml = readFileSync(path.join(SCHEMA_DIR, `${schemaId}.gschema.xml`), 'utf8');
		expect(/path="([^"]+)"/.exec(xml)[1]).toMatch(/^\/org\/gnome\/shell\/extensions\//);
		expect(/gettext-domain="([^"]+)"/.exec(xml)[1]).toBe(METADATA['gettext-domain']);
	});
});

describe('GSettings schema values', () => {
	const PROBES = [
		['set_int', 'nbcols', 5],
		['set_int', 'nbcols', 10],
		['set_int', 'nbcols', 60],
		['set_int', 'nbcols', 61],
		['set_int', 'emojisize', 9],
		['set_int', 'emojisize', 100],
		['set_int', 'emojisize', 101],
		['set_int', 'skin-tone', -1],
		['set_int', 'skin-tone', 5],
		['set_int', 'skin-tone', 6],
		['set_int', 'gender', 2],
		['set_int', 'gender', 3],
		['set_string', 'position', 'left'],
		['set_string', 'position', 'bottom'],
		['set_string', 'position', 'top'],
		['set_boolean', 'always-show', false],
		// The default value and the same value again: "changed" is emitted either way
		['set_int', 'nbcols', 11],
		['set_int', 'nbcols', 11],
		['set_int', 'emojisize', 44],
		['set_int', 'emojisize', 44],
		['set_strv', 'recently-used', ['a', 'b']],
		['set_strv', 'recently-used', ['a', 'b']],
		['set_strv', 'emoji-keybinding', []],
	];

	it('declares a range or a choice for every key whose values are limited', () => {
		const xml = readFileSync(path.join(SCHEMA_DIR, `${METADATA['settings-schema']}.gschema.xml`), 'utf8');
		for (const key of ['nbcols', 'emojisize', 'skin-tone', 'gender']) {
			expect(new RegExp(`name="${key}"[\\s\\S]*?<range min="\\d+" max="\\d+"\\s*/>`).test(xml), key).toBe(true);
		}
		expect(/name="position"[\s\S]*?<choices>[\s\S]*?<\/choices>/.test(xml)).toBe(true);
	});

	it('is enforced by the fake exactly as real GSettings enforces it', () => {
		const scratch = mkdtempSync(path.join(os.tmpdir(), 'emoji-settings-'));
		try {
			cpSync(SCHEMA_DIR, scratch, { recursive: true });
			expect(run('glib-compile-schemas', ['--strict', scratch]).status).toBe(0);
			const script = path.join(ROOT, 'tests/integration/real/inspect-settings.js');
			const real = run('gjs', ['-m', script, scratch, JSON.stringify(PROBES)], {
				env: { ...process.env, GSETTINGS_BACKEND: 'memory' },
			});
			expect(real.status, real.stderr).toBe(0);
			const realResults = JSON.parse(
				real.stdout
					.split('\n')
					.filter((line) => line.startsWith('['))
					.at(-1),
			);

			const fake = new FakeSettings(parseSchema(path.join(SCHEMA_DIR, `${METADATA['settings-schema']}.gschema.xml`)), {
				enforce: true,
			});
			const getters = {
				set_int: 'get_int',
				set_string: 'get_string',
				set_boolean: 'get_boolean',
				set_strv: 'get_strv',
			};
			const fakeResults = PROBES.map(([method, key, value]) => {
				let emitted = false;
				const id = fake.connect(`changed::${key}`, () => (emitted = true));
				const result = fake[method](key, value);
				fake.disconnect(id);
				return { method, key, value, result, after: fake[getters[method]](key), emitted };
			});
			expect(fakeResults).toEqual(realResults);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});

describe('translations', () => {
	it('has a catalogue directory for every language', () => {
		expect(languages().length).toBeGreaterThan(5);
	});

	it.each(languages().map((l) => [l]))('%s: the .po file is valid and its format strings match', (language) => {
		const po = path.join(LOCALE_DIR, language, 'LC_MESSAGES', `${METADATA['gettext-domain']}.po`);
		const result = run('msgfmt', ['--check', '--check-format', '--output-file=/dev/null', po]);
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
	});

	describe('compiled catalogues', () => {
		let scratch;
		beforeAll(() => {
			scratch = mkdtempSync(path.join(os.tmpdir(), 'emoji-selector-mo-'));
		});
		afterAll(() => rmSync(scratch, { recursive: true, force: true }));

		it.each(languages().map((l) => [l]))('%s: the shipped .mo is what the .po compiles to', (language) => {
			const dir = path.join(LOCALE_DIR, language, 'LC_MESSAGES');
			const mo = path.join(dir, `${METADATA['gettext-domain']}.mo`);
			const fresh = path.join(scratch, `${language}.mo`);
			expect(run('msgfmt', ['--output-file', fresh, path.join(dir, `${METADATA['gettext-domain']}.po`)]).status).toBe(
				0,
			);
			const shipped = run('msgunfmt', [mo]);
			const expected = run('msgunfmt', [fresh]);
			expect(shipped.status).toBe(0);
			expect(shipped.stdout).toBe(expected.stdout);
		});
	});

	it('extracts the same message ids as the committed template (so nothing is untranslatable)', () => {
		const scratch = mkdtempSync(path.join(os.tmpdir(), 'emoji-selector-pot-'));
		try {
			const out = path.join(scratch, 'fresh.pot');
			const files = readFileSync(path.join(ROOT, 'POTFILES.in'), 'utf8').split('\n').filter(Boolean);
			const result = run('xgettext', ['--from-code=UTF-8', '--keyword=_', '--output', out, ...files], { cwd: ROOT });
			expect(result.status).toBe(0);
			// --no-wrap joins the continuation lines of long messages, which a plain scan would miss.
			const ids = (file) => {
				const catalogue = run('msgcat', ['--no-wrap', file]);
				expect(catalogue.status, catalogue.stderr).toBe(0);
				return [...catalogue.stdout.matchAll(/^msgid "(.+)"$/gm)].map((m) => m[1]).sort();
			};
			expect(ids(out)).toEqual(ids(path.join(LOCALE_DIR, `${METADATA['gettext-domain']}.pot`)));
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});

describe('GNOME API surface', () => {
	/** Resolves dotted API paths against the real libraries (Shell 51 typelibs in the devcontainer). */
	function realApi(paths) {
		const script = path.join(ROOT, 'tests/integration/real/inspect-api.js');
		const result = run('gjs', ['-m', script, JSON.stringify(paths)]);
		expect(result.status, result.stderr).toBe(0);
		return JSON.parse(
			result.stdout
				.split('\n')
				.filter((line) => line.startsWith('{'))
				.at(-1),
		);
	}

	// Names that look like API members of the shell libraries, in the shell-side logic files.
	const LIBRARY_REFERENCE = /\b(Clutter|GLib|Meta|Shell|St)\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g;
	const walk = (dir) =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
		);
	const usedPaths = () => {
		const used = new Set();
		const shellSide = walk(path.join(ROOT, 'src')).filter(
			(file) => file.endsWith('.ts') && !file.includes('/data/') && !file.endsWith('/prefs.ts'),
		);
		for (const file of shellSide) {
			const code = readFileSync(file, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*\/\/.*$/gm, '');
			for (const match of code.matchAll(LIBRARY_REFERENCE)) {
				// `St.Clipboard.get_default` -> stop at the class: its methods are not constants.
				used.add(match[0].replace(/\.(get_default|prototype)\b.*$/, ''));
			}
		}
		return [...used].sort();
	};

	it('finds the shell libraries used by the extension in the real typelibs', () => {
		const paths = usedPaths();
		expect(paths).toContain('Clutter.KEY_Return');
		expect(paths.length).toBeGreaterThan(10);
		const missing = Object.entries(realApi(paths))
			.filter(([, v]) => v.type === 'undefined')
			.map(([name]) => name);
		expect(missing).toEqual([]);
	});

	it('gives the unit-test fakes the real values for every constant they define', () => {
		const gi = { Clutter, GLib, Meta, Shell, St };
		const constants = {
			'Clutter.KEY_Return': gi.Clutter.KEY_Return,
			'Clutter.KEY_KP_Enter': gi.Clutter.KEY_KP_Enter,
			'Clutter.ModifierType.SHIFT_MASK': gi.Clutter.ModifierType.SHIFT_MASK,
			'Clutter.ModifierType.CONTROL_MASK': gi.Clutter.ModifierType.CONTROL_MASK,
			'Clutter.ActorAlign.FILL': gi.Clutter.ActorAlign.FILL,
			'Clutter.ActorAlign.START': gi.Clutter.ActorAlign.START,
			'Clutter.ActorAlign.CENTER': gi.Clutter.ActorAlign.CENTER,
			'Clutter.ActorAlign.END': gi.Clutter.ActorAlign.END,
			'Clutter.EVENT_PROPAGATE': gi.Clutter.EVENT_PROPAGATE,
			'Clutter.EVENT_STOP': gi.Clutter.EVENT_STOP,
			'St.ClipboardType.PRIMARY': gi.St.ClipboardType.PRIMARY,
			'St.ClipboardType.CLIPBOARD': gi.St.ClipboardType.CLIPBOARD,
			'Meta.KeyBindingFlags.NONE': gi.Meta.KeyBindingFlags.NONE,
			'Shell.ActionMode.ALL': gi.Shell.ActionMode.ALL,
			'GLib.PRIORITY_DEFAULT': gi.GLib.PRIORITY_DEFAULT,
			'GLib.SOURCE_REMOVE': gi.GLib.SOURCE_REMOVE,
			'GLib.SOURCE_CONTINUE': gi.GLib.SOURCE_CONTINUE,
		};
		const real = realApi(Object.keys(constants));
		expect(Object.fromEntries(Object.entries(real).map(([name, v]) => [name, v.value]))).toEqual(constants);
	});

	it('does not give the fakes constants that the real libraries lack', () => {
		const gi = { Clutter, St, Meta, Shell };
		const defined = [];
		for (const [libraryName, group] of Object.entries({
			Clutter: gi.Clutter,
			St: gi.St,
			Meta: gi.Meta,
			Shell: gi.Shell,
		})) {
			for (const [name, value] of Object.entries(group)) {
				if (typeof value !== 'function') {
					defined.push(`${libraryName}.${name}`);
				}
			}
		}
		const missing = Object.entries(realApi(defined))
			.filter(([, v]) => v.type === 'undefined')
			.map(([name]) => name);
		expect(missing).toEqual([]);
	});
});

describe('bundled files', () => {
	/** Runs the extension in the fake Shell, opening every category, and returns what it created. */
	function runEverything() {
		const { raw } = createSettings();
		extensionState.settings = raw;
		const extension = new EmojiSelectorExtension({ uuid: METADATA.uuid });
		extension.enable();
		const { indicator } = main.panel.statusArea.get(METADATA.uuid);
		const [header] = indicator.menu.items;
		header.children.forEach((button) => button.click());
		const result = {
			actors: [...Actor.registry],
			icons: header.children.map((button) => button.child.gicon.path ?? button.child.gicon),
		};
		extension.disable();
		return result;
	}

	it('ships every icon the categories use, as valid SVG', () => {
		const custom = runEverything()
			.icons.filter((icon) => icon.endsWith('.svg'))
			.map((icon) => path.basename(icon));
		expect(custom).toHaveLength(8);
		for (const name of custom) {
			const svg = readFileSync(path.join(EXTENSION_DIR, 'icons', name), 'utf8');
			expect(svg, name).toMatch(/<svg[\s>]/);
			expect(svg, name).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i);
		}
	});

	it("styles exactly the classes the extension uses, apart from the Shell theme's own", () => {
		const css = readFileSync(path.join(EXTENSION_DIR, 'stylesheet.css'), 'utf8');
		const styled = new Set([...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]));
		// Provided by the Shell's theme, or left for users' themes to style.
		const external = new Set(['system-status-icon', 'search-entry']);
		const used = new Set(runEverything().actors.flatMap((actor) => actor.style_class.split(/\s+/).filter(Boolean)));
		expect([...used].filter((name) => !styled.has(name) && !external.has(name))).toEqual([]);
		expect([...styled].filter((name) => !used.has(name))).toEqual([]);
	});

	it('ships no executables or native libraries', () => {
		const walk = (dir) =>
			readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
				entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
			);
		const offenders = walk(EXTENSION_DIR).filter((file) => {
			const header = readFileSync(file).subarray(0, 4);
			const hasElfHeader = header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
			const isExecutable = (statSync(file).mode & 0o111) !== 0;
			return hasElfHeader || isExecutable || /\.(so|dll|dylib|exe|sh)$/.test(file);
		});
		expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
	});
});
