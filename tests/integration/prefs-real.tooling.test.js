// The extension's preferences, built and installed for real, opened in the real GTK 4 and libadwaita (under
// Xvfb) with the Extensions app's own preferences module, and driven through the real widgets. The
// unit tests of the preferences use fakes of these widgets; this checks the fakes against reality.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accelerator_parse as acceleratorParseFake } from '../support/fakes/adw.js';
import { EXTENSION_DIR } from '../support/paths.js';
import { buildAndInstall } from '../support/real-package.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const HARNESS = path.join(ROOT, 'tests/integration/real/prefs-smoke.js');
// The Shell's own typelibs (Shew, which the Extensions app's module imports) are in this directory.
// What a GPU-less container prints that has nothing to do with the preferences.
const BENIGN = /^(MESA|libEGL warning)/;
const TYPELIBS = ['/usr/lib64/gnome-shell/girepository-1.0'];

describe('the preferences in the real libraries', () => {
	let base;
	let xdgDataHome;

	beforeAll(() => {
		base = mkdtempSync(path.join(os.tmpdir(), 'emoji-prefs-'));
		({ xdgDataHome } = buildAndInstall(base));
	}, 120_000);
	afterAll(() => rmSync(base, { recursive: true, force: true }));

	function open(...args) {
		const result = spawnSync('xvfb-run', ['-a', 'gjs', '-m', HARNESS, ...args], {
			encoding: 'utf8',
			env: {
				PATH: process.env.PATH,
				HOME: path.join(base, 'home'),
				XDG_DATA_HOME: xdgDataHome,
				GSETTINGS_BACKEND: 'memory',
				GI_TYPELIB_PATH: [process.env.GI_TYPELIB_PATH, ...TYPELIBS].filter(Boolean).join(':'),
				LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
				LANG: 'C.UTF-8',
			},
		});
		if (result.status !== 0) {
			throw new Error(`The preferences harness failed (status ${result.status}):\n${result.stderr}`);
		}
		// Mesa complains that there is no GPU in the container; anything else is a problem of the preferences.
		const problems = result.stderr.split('\n').filter((line) => line.trim() !== '' && !BENIGN.test(line));
		return { status: result.status, problems, report: JSON.parse(result.stdout.trim().split('\n').at(-1)) };
	}

	it('opens without GTK, libadwaita or GJS complaining about anything', () => {
		const { status, problems } = open();
		expect({ status, problems }).toEqual({ status: 0, problems: [] });
	}, 60_000);

	describe('the window', () => {
		let report;
		beforeAll(() => {
			report = open().report;
		}, 60_000);

		it('has the three pages and shows up', () => {
			expect(report.pages.slice(0, 3)).toEqual(['Layout', 'Keyboard bindings', 'About']);
			expect(report.mapped).toBe(true);
		});

		it('shows its texts as plain text, escaped where libadwaita reads markup', () => {
			expect(report.groupDescriptions[1]).toBe(
				'Modifier keys must be between chevrons\nThe default value is &lt;Super&gt;period\nDon&apos;t use a keyboard shortcut that already exists.',
			);
			expect(report.groupTitles).toContain('Emoji Selector');
		});

		it('offers the two positions and writes the chosen one to the settings, and follows them', () => {
			expect(report.position).toEqual({
				items: ['From top to bottom', 'From bottom to top'],
				initial: 0,
				afterChoosingBottom: 'bottom',
				afterSettingTop: 0,
			});
		});

		it.each(['nbcols', 'emojisize'])(
			'binds the spin row of %s to the setting, within the range of the schema',
			(key) => {
				const spin = report.spins[key];
				expect(spin.adjustment).toEqual(spin.schema);
				expect(spin.afterChoosing).toBe(spin.adjustment[0] + 2);
				expect(spin.afterSetting).toBe(spin.adjustment[0] + 5);
				expect(spin.afterTooBig).toEqual([spin.adjustment[1], spin.adjustment[1]]);
			},
		);

		it('applies a valid shortcut, refuses an invalid one, and clears it when empty', () => {
			expect(report.shortcut.initialText).toBe('<Super>period');
			expect(report.shortcut.valid).toEqual({ stored: ['<Control><Alt>e'], error: false });
			expect(report.shortcut.invalid).toEqual({ stored: ['<Control><Alt>e'], error: true });
			expect(report.shortcut.empty).toEqual({ stored: [], error: false });
			expect(report.shortcut.afterSetting).toBe('<Super>period');
		});

		it('parses accelerators the way the preferences assume', () => {
			// [accepted, key]: modifiers alone are accepted, with no key, which the preferences refuse.
			const accepted = (text) => report.parse[text].startsWith('true') && !report.parse[text].endsWith(' 0');
			expect(['<Super>period', '<Control><Alt>e', 'F12', '<Super>1', 'KP_1'].map(accepted)).toEqual(
				Array(5).fill(true),
			);
			expect(['not a shortcut', '<Super>', 'period period', ''].map(accepted)).toEqual(Array(4).fill(false));
		});

		it('is mirrored by the fake that the unit tests use for the same strings', () => {
			for (const [text, real] of Object.entries(report.parse)) {
				const [valid, key] = acceleratorParseFake(text);
				expect(valid && key !== 0, text).toBe(real.startsWith('true') && !real.endsWith(' 0'));
			}
		});

		it('keeps the icon shown, and the shortcut options disabled, without a shortcut', () => {
			expect(report.shortcut.withoutShortcut).toEqual({
				useKeybinding: false,
				alwaysShow: true,
				alwaysShowRow: true,
				entrySensitive: false,
				alwaysShowSensitive: false,
			});
			expect(report.shortcut.withShortcut).toEqual({ entrySensitive: true, alwaysShowSensitive: true });
		});

		it('presents the author, the contributors and the links', () => {
			expect(report.about).toEqual({
				author: 'Romain F. T.',
				contributors: 'Jimmy Scionti\nRyan Gonzalez\nxurizaemon\nFran Diéguez',
				link: 'https://github.com/maoschanz/emoji-selector-for-gnome',
				linkActivatable: true,
				keyNames: 'https://raw.githubusercontent.com/GNOME/gtk/master/gdk/keynames.txt',
			});
		});
	});

	it('opens just as well in a right-to-left language, without complaints', () => {
		const { status, problems, report } = open('rtl');
		expect({ status, problems }).toEqual({ status: 0, problems: [] });
		expect(report.direction).toBe('rtl');
		expect(report.mapped).toBe(true);
	}, 60_000);
});
