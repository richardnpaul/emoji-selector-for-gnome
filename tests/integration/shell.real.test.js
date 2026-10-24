// The extension, built and installed for real, running in a real (headless) GNOME Shell 51: enabled and
// disabled twice over D-Bus, and driven by a test-only extension that clicks and types with a virtual
// pointer and keyboard. Everything the driver saw is in the Shell's log, on lines starting with "DRIVER".
//
// (Only the Shell of the dev container, 51, is run; 45 to 50 are covered by reading their sources,
// see tests/README.md.)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXTENSION_DIR, METADATA } from '../support/paths.js';
import { readCatalogue } from '../support/po.js';
import { buildAndInstall } from '../support/real-package.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');

describe('the extension in a real GNOME Shell', () => {
	let base;
	let xdgDataHome;
	let log;
	let reports;
	let status;

	beforeAll(() => {
		base = mkdtempSync(path.join(os.tmpdir(), 'emoji-shell-'));
		({ xdgDataHome } = buildAndInstall(base));
		const logFile = path.join(base, 'shell.log');
		const result = spawnSync(
			'bash',
			[path.join(ROOT, 'tests/integration/real/run-shell.sh'), xdgDataHome, logFile, METADATA.uuid],
			{
				encoding: 'utf8',
				timeout: 240_000,
				env: {
					PATH: process.env.PATH,
					HOME: path.join(base, 'home'),
					GI_TYPELIB_PATH: process.env.GI_TYPELIB_PATH ?? '',
					LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
					LANG: 'C.UTF-8',
				},
			},
		);
		status = { code: result.status, stderr: result.stderr };
		log = readFileSync(logFile, 'utf8');
		reports = log
			.split('\n')
			.filter((line) => line.includes('DRIVER {'))
			.map((line) => JSON.parse(line.slice(line.indexOf('DRIVER ') + 'DRIVER '.length)));
	}, 300_000);
	afterAll(() => rmSync(base, { recursive: true, force: true }));

	/** The values the driver reported under `name`, in order. */
	const reported = (name) => reports.filter((report) => report.name === name).map((report) => report.value);

	it('ran to the end', () => {
		expect(status).toEqual({ code: 0, stderr: '' });
		expect(reports.some((report) => report.name === 'driver-error')).toBe(false);
	});

	it('logs no error or critical warning at all (a use of a destroyed actor does not name the extension)', () => {
		// The only complaint left is the fake logind not knowing the user, which has nothing to do with the extension.
		const noise = /Could not get a proxy for user/;
		const complaints = log
			.split('\n')
			.filter((line) => /CRITICAL|JS ERROR|already disposed|Gjs-WARNING/i.test(line) && !noise.test(line));
		expect(complaints).toEqual([]);
	});

	it('puts its indicator in the panel when enabled, and takes it away when disabled', () => {
		expect(reported('enabled')).toEqual([
			{ round: 1, present: true, visible: true, menuItems: 12, menuOpen: false },
			{ round: 2, present: true, visible: true, menuItems: 12, menuOpen: false },
		]);
		expect(reported('disabled')).toEqual([
			{ present: false, leftovers: 0 },
			{ present: false, leftovers: 0 },
		]);
	});

	it('can be disabled while its menu is open, as when the screen locks, and its shortcut is gone after', () => {
		expect(reported('left-open')).toEqual([{ menuOpen: true }]);
		expect(reported('shortcut-after-disable')).toEqual([{ present: false }]);
	});

	it('opens and closes the menu with its keyboard shortcut', () => {
		expect(reported('shortcut')).toEqual([{ opened: true, closed: true, attempts: ['ok', 'ok'] }]);
	});

	it('focuses the search entry when the menu opens, showing the recently used emoji', () => {
		const [opened] = reported('opened');
		expect(opened.menuOpen).toBe(true);
		expect(opened.entryFocused).toBe(true);
		expect(opened.recents).toHaveLength(11);
		expect(opened.recents.slice(0, 3)).toEqual(['😂', '❤️', '😍']);
	});

	it('searches as the user types', () => {
		const [typed] = reported('typed');
		expect(typed.text).toBe('cat');
		expect(typed.results.slice(0, 2)).toEqual(['🐈', '😺']);
	});

	it('copies the emoji that is clicked, remembers it and closes the menu', () => {
		expect(reported('clicked')).toEqual([{ clipboard: '🐈', menuOpen: false, recentlyUsed: ['🐈', '😂', '❤️'] }]);
	});

	it('opens a category from its button with a clean search, and closes it again', () => {
		expect(reported('category')).toEqual([{ entryText: '', buttons: 9, checked: true, rows: 15, emojis: 170 }]);
		expect(reported('category-closed')).toEqual([{ checked: false }]);
	});

	it('follows its settings while it runs', () => {
		expect(reported('resized')).toEqual([{ styles: ['font-size: 44px; color: #FFFFFF;'] }]);
		expect(reported('always-show')).toEqual([{ visible: false }]);
		expect(reported('rebuilt')).toEqual([
			{ replaced: true, oldIsGone: true, oneIndicator: 1, recents: 12, lastItemIsHeader: true },
		]);
		expect(reported('shortcut-off')).toEqual([{ menuOpen: false }]);
		expect(reported('shortcut-on-again')).toEqual([{ menuOpen: true }]);
	});

	// The texts the Shell shows, as the driver reads them from the actors of the menu: [panel, search hint, categories, tones, genders].
	const CATEGORIES = [
		'Smileys & Body',
		'Peoples & Clothing',
		'Animals & Nature',
		'Food & Drink',
		'Travel & Places',
		'Activities & Sports',
		'Objects',
		'Symbols',
		'Flags',
	];
	const TONES = [
		'No skin tone',
		'Light skin tone',
		'Medium light skin tone',
		'Medium skin tone',
		'Medium dark skin tone',
		'Dark skin tone',
	];
	const texts = (translate) => ({
		panelName: translate('Emoji Selector'),
		hint: translate('Type here to search…'),
		categories: CATEGORIES.map(translate),
		tones: TONES.map(translate),
		genders: ['Women', 'Men'].map(translate),
	});

	it('shows its texts in English to a user whose language has no catalogue', () => {
		expect(reported('texts')).toEqual([texts((msgid) => msgid)]);
	});

	describe('in the languages of its users', () => {
		// [a locale installed in the dev container, the catalogue its users get]
		const USERS = [
			['ja_JP.utf8', 'ja'],
			['ar_EG.utf8', 'ar'],
			['de_DE.utf8', 'de'],
		];

		it.each(USERS)(
			'a user of %s sees the catalogue %s on the panel and in the menu',
			(locale, name) => {
				const entries = new Map(
					readCatalogue(
						path.join(EXTENSION_DIR, 'locale', name, 'LC_MESSAGES', `${METADATA['gettext-domain']}.po`),
					).entries.map((entry) => [entry.msgid, entry.msgstr]),
				);
				const logFile = path.join(base, `shell-${locale}.log`);
				const result = spawnSync(
					'bash',
					[
						path.join(ROOT, 'tests/integration/real/run-shell.sh'),
						xdgDataHome,
						logFile,
						METADATA.uuid,
						locale,
						'texts',
					],
					{
						encoding: 'utf8',
						timeout: 240_000,
						env: {
							PATH: process.env.PATH,
							HOME: path.join(base, 'home'),
							GI_TYPELIB_PATH: process.env.GI_TYPELIB_PATH ?? '',
							LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
							LANG: 'C.UTF-8',
						},
					},
				);
				expect({ code: result.status, stderr: result.stderr }).toEqual({ code: 0, stderr: '' });
				const seen = readFileSync(logFile, 'utf8')
					.split('\n')
					.filter((line) => line.includes('DRIVER {"name":"texts"'))
					.map((line) => JSON.parse(line.slice(line.indexOf('DRIVER ') + 'DRIVER '.length)).value);
				expect(seen).toEqual([texts((msgid) => entries.get(msgid))]);
			},
			300_000,
		);
	});
});
