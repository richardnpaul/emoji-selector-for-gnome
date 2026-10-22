// Behaviour of the three maintainer scripts (build-a-zip.sh, install.sh,
// update-and-compile-translations.sh), run for real in a sandbox copy of the project so that the
// working tree is never touched. The sandbox path contains a space on purpose.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXTENSION_DIR, METADATA } from '../support/paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const UUID = METADATA.uuid;
const DOMAIN = METADATA['gettext-domain'];
const SCRIPTS = ['build-a-zip.sh', 'install.sh', 'update-and-compile-translations.sh'];
// Every shell script the project owns (the safe-shell rules apply to all of them).
const ALL_SHELL_SCRIPTS = [
	...readdirSync(ROOT).filter((name) => name.endsWith('.sh')),
	...readdirSync(path.join(ROOT, '.devcontainer'))
		.filter((name) => name.endsWith('.sh'))
		.map((name) => `.devcontainer/${name}`),
];
const directoriesIn = (dir) =>
	readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

const COMPILED = {
	'extension.js': '// extension\n',
	'prefs.js': '// prefs\n',
	'lib/emoji.js': '// lib\n',
	'data/emojisCharacters.js': '// data\n',
};

describe('maintainer scripts', () => {
	let base;
	let repo;
	const compiled = () => path.join(repo, 'dist', UUID);

	beforeEach(() => {
		base = mkdtempSync(path.join(os.tmpdir(), 'emoji-scripts-'));
		repo = path.join(base, 'my repo');
		mkdirSync(repo);
		cpSync(EXTENSION_DIR, path.join(repo, UUID), { recursive: true });
		cpSync(path.join(ROOT, 'POTFILES.in'), path.join(repo, 'POTFILES.in'));
		cpSync(path.join(ROOT, 'src'), path.join(repo, 'src'), { recursive: true });
		// What `npm run build:ts` writes (the real compiler is exercised by project-rules.tooling.test.js).
		for (const [file, content] of Object.entries(COMPILED)) {
			mkdirSync(path.dirname(path.join(compiled(), file)), { recursive: true });
			writeFileSync(path.join(compiled(), file), content);
		}
		for (const script of SCRIPTS) {
			cpSync(path.join(ROOT, script), path.join(repo, script));
			chmodSync(path.join(repo, script), 0o755);
		}
	});
	afterEach(() => rmSync(base, { recursive: true, force: true }));

	function run(script, args = [], env = {}) {
		const result = spawnSync('bash', [path.join(repo, script), ...args], {
			cwd: base, // not the repo: the scripts must not depend on where they are called from
			encoding: 'utf8',
			env: { PATH: process.env.PATH, HOME: path.join(base, 'home'), LANG: 'C.UTF-8', ...env },
		});
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	}

	const walk = (dir) =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
		);
	/** A fingerprint of every file (path and content) below `dir`. */
	const fingerprint = (dir) =>
		walk(dir)
			.sort()
			.map((file) => `${path.relative(dir, file)} ${createHash('sha256').update(readFileSync(file)).digest('hex')}`)
			.join('\n');
	const zipEntries = (zip) => {
		const listing = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
		expect(listing.status, listing.stderr).toBe(0);
		return listing.stdout.split('\n').filter(Boolean);
	};

	describe('build-a-zip.sh', () => {
		const zipPath = () => path.join(repo, 'dist', `${UUID}.zip`);

		it('builds dist/<uuid>.zip by default, with only the files that ship', () => {
			writeFileSync(path.join(compiled(), 'extension.js.orig'), 'junk');
			writeFileSync(path.join(compiled(), '.extension.js.swp'), 'junk');
			writeFileSync(path.join(compiled(), 'extension.d.ts'), 'junk');
			writeFileSync(path.join(compiled(), 'lib/emoji.js.map'), 'junk');
			writeFileSync(path.join(repo, UUID, 'extension.js'), '// a stale legacy file, not shipped\n');
			writeFileSync(path.join(repo, UUID, 'notes.txt'), 'junk');
			writeFileSync(path.join(repo, UUID, 'locale/de/LC_MESSAGES/de.po~'), 'junk');
			const result = run('build-a-zip.sh');
			expect(result.stderr).toBe('');
			expect(result.status).toBe(0);
			const entries = zipEntries(zipPath());
			expect(entries).toEqual([...entries].sort());
			expect(entries).toEqual(
				expect.arrayContaining([
					'extension.js',
					'prefs.js',
					'lib/emoji.js',
					'metadata.json',
					'stylesheet.css',
					'data/emojisCharacters.js',
				]),
			);
			const allowed =
				/^(?:[A-Za-z]+\.js|(?:lib|data)\/\w+\.js|metadata\.json|stylesheet\.css|schemas\/[\w.-]+\.gschema\.xml|locale\/[\w-]+\/LC_MESSAGES\/emoji-selector\.mo|icons\/[\w-]+\.svg)$/;
			expect(entries.filter((entry) => !allowed.test(entry))).toEqual([]);
		});

		it('leaves out translation sources and the compiled schema, which the EGO builds itself', () => {
			writeFileSync(path.join(repo, UUID, 'schemas/gschemas.compiled'), 'compiled');
			run('build-a-zip.sh');
			const entries = zipEntries(zipPath());
			expect(entries.some((e) => /\.pot?$/.test(e))).toBe(false);
			expect(entries).not.toContain('schemas/gschemas.compiled');
			const languages = directoriesIn(path.join(repo, UUID, 'locale'));
			expect(entries.filter((e) => e.endsWith('.mo')).sort()).toEqual(
				languages.map((language) => `locale/${language}/LC_MESSAGES/emoji-selector.mo`).sort(),
			);
		});

		it('does not modify the project it builds from', () => {
			const before = fingerprint(path.join(repo, UUID)) + fingerprint(compiled());
			expect(run('build-a-zip.sh').status).toBe(0);
			expect(fingerprint(path.join(repo, UUID)) + fingerprint(compiled())).toBe(before);
		});

		it('writes to the directory it is given, creating it, and replaces an earlier zip', () => {
			const out = path.join(base, 'some where', 'out');
			expect(run('build-a-zip.sh', [out]).status).toBe(0);
			const zip = path.join(out, `${UUID}.zip`);
			expect(existsSync(zip)).toBe(true);
			writeFileSync(path.join(compiled(), 'extension.js'), '// changed\n');
			expect(run('build-a-zip.sh', [out]).status).toBe(0);
			const check = spawnSync('unzip', ['-p', zip, 'extension.js'], { encoding: 'utf8' });
			expect(check.stdout).toBe('// changed\n');
			expect(readdirSync(out)).toEqual([`${UUID}.zip`]);
		});

		it('builds the same zip from the same sources', () => {
			run('build-a-zip.sh', [path.join(base, 'a')]);
			run('build-a-zip.sh', [path.join(base, 'b')]);
			expect(zipEntries(path.join(base, 'a', `${UUID}.zip`))).toEqual(zipEntries(path.join(base, 'b', `${UUID}.zip`)));
		});

		it('reports the zip it made', () => {
			expect(run('build-a-zip.sh').stdout).toContain(path.join(repo, 'dist', `${UUID}.zip`));
		});

		it('fails clearly, and builds nothing, when the extension directory is missing', () => {
			rmSync(path.join(repo, UUID), { recursive: true });
			const result = run('build-a-zip.sh');
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(UUID);
			expect(existsSync(zipPath())).toBe(false);
		});

		it('fails clearly, and builds nothing, when the extension was not compiled', () => {
			rmSync(path.join(repo, 'dist'), { recursive: true });
			const result = run('build-a-zip.sh');
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('npm run build:ts');
			expect(existsSync(path.join(repo, 'dist'))).toBe(false);
		});

		it.each(['extension.js', 'prefs.js'])('fails when the compiled %s is missing', (file) => {
			rmSync(path.join(compiled(), file));
			const result = run('build-a-zip.sh');
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(file);
			expect(existsSync(zipPath())).toBe(false);
		});

		it('fails, and leaves an earlier zip alone, when a shipped file is missing', () => {
			expect(run('build-a-zip.sh').status).toBe(0);
			const before = readFileSync(zipPath());
			rmSync(path.join(repo, UUID, 'metadata.json'));
			const result = run('build-a-zip.sh');
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('metadata.json');
			expect(readFileSync(zipPath()).equals(before)).toBe(true);
		});

		it('fails, rather than claiming success, when the zip path is a directory', () => {
			mkdirSync(zipPath(), { recursive: true });
			const result = run('build-a-zip.sh');
			expect(result.status).not.toBe(0);
			expect(result.stdout).not.toContain('Built');
			expect(readdirSync(zipPath())).toEqual([]);
		});

		it('rejects extra arguments', () => {
			const result = run('build-a-zip.sh', ['a', 'b']);
			expect(result.status).toBe(2);
			expect(result.stderr).toMatch(/usage/i);
		});

		it('produces a package that shexli has no packaging complaint about', () => {
			expect(run('build-a-zip.sh').status).toBe(0);
			const shexli = spawnSync('shexli', ['--format', 'json', zipPath()], { encoding: 'utf8' });
			expect(shexli.status, shexli.stderr || String(shexli.error)).toBe(0);
			const findings = JSON.parse(shexli.stdout).findings.map((f) => f.rule_id);
			expect(findings).not.toContain('EGO-P-006');
		});
	});

	describe('install.sh', () => {
		const extensions = () => path.join(base, 'ext dir');
		const install = (args = [], env = {}) => run('install.sh', args, { EXTENSIONS_DIR: extensions(), ...env });

		it('installs the built extension, with its schema compiled where it is installed', () => {
			const result = install();
			expect(result.stderr).toBe('');
			expect(result.status).toBe(0);
			const target = path.join(extensions(), UUID);
			expect(existsSync(path.join(target, 'metadata.json'))).toBe(true);
			expect(existsSync(path.join(target, 'extension.js'))).toBe(true);
			expect(statSync(path.join(target, 'schemas/gschemas.compiled')).size).toBeGreaterThan(0);
			expect(walk(target).some((file) => /\.pot?$/.test(file))).toBe(false);
			expect(result.stdout).toContain(target);
		});

		it('leaves the project itself untouched', () => {
			const before = fingerprint(repo);
			install();
			expect(fingerprint(repo)).toBe(before);
		});

		it('replaces an earlier install completely, without touching other extensions', () => {
			const target = path.join(extensions(), UUID);
			mkdirSync(target, { recursive: true });
			writeFileSync(path.join(target, 'stale.js'), 'old');
			mkdirSync(path.join(extensions(), 'other@example.org'));
			writeFileSync(path.join(extensions(), 'other@example.org', 'keep.js'), 'mine');
			expect(install().status).toBe(0);
			expect(existsSync(path.join(target, 'stale.js'))).toBe(false);
			expect(readFileSync(path.join(extensions(), 'other@example.org', 'keep.js'), 'utf8')).toBe('mine');
		});

		it('installs under ~/.local/share/gnome-shell/extensions by default', () => {
			const result = run('install.sh', [], { HOME: path.join(base, 'a home') });
			expect(result.status).toBe(0);
			expect(existsSync(path.join(base, 'a home/.local/share/gnome-shell/extensions', UUID, 'metadata.json'))).toBe(
				true,
			);
		});

		it('refuses a relative target, which would depend on where it is run from', () => {
			const result = install([], { EXTENSIONS_DIR: 'relative/dir' });
			expect(result.status).not.toBe(0);
			expect(result.stderr).toMatch(/absolute/i);
		});

		it('refuses --system unless run as root, and then installs nothing', () => {
			const isRoot = process.getuid() === 0;
			const result = install(['--system']);
			// Root may install for every user (here into EXTENSIONS_DIR); anyone else is refused.
			expect({
				installed: result.status === 0,
				explainedItNeedsRoot: /root/i.test(result.stderr),
				createdDirectory: existsSync(extensions()),
			}).toEqual(
				isRoot
					? { installed: true, explainedItNeedsRoot: false, createdDirectory: true }
					: { installed: false, explainedItNeedsRoot: true, createdDirectory: false },
			);
		});

		it('refuses to replace the project itself when EXTENSIONS_DIR is its working tree', () => {
			const before = fingerprint(repo);
			const result = install([], { EXTENSIONS_DIR: repo });
			expect(result.status).not.toBe(0);
			expect(result.stderr).toMatch(/working tree|sources/i);
			expect(fingerprint(repo)).toBe(before);
		});

		it('leaves a usable install and no stray directory when several installs run at once', async () => {
			const attempts = Array.from(
				{ length: 6 },
				() =>
					new Promise((resolve) => {
						const child = spawn('bash', [path.join(repo, 'install.sh')], {
							cwd: base,
							env: { PATH: process.env.PATH, HOME: path.join(base, 'home'), EXTENSIONS_DIR: extensions() },
						});
						child.on('close', (status) => resolve(status));
					}),
			);
			const statuses = await Promise.all(attempts);
			expect(statuses).toContain(0);
			expect(readdirSync(extensions())).toEqual([UUID]);
			expect(readdirSync(path.join(extensions(), UUID)).filter((entry) => entry.startsWith('.'))).toEqual([]);
			expect(existsSync(path.join(extensions(), UUID, 'metadata.json'))).toBe(true);
		});

		it('rejects unknown options', () => {
			const result = install(['--bogus']);
			expect(result.status).toBe(2);
			expect(result.stderr).toMatch(/usage/i);
		});

		it('fails, installing nothing, when the build fails', () => {
			rmSync(path.join(repo, UUID, 'metadata.json'));
			const result = install();
			expect(result.status).not.toBe(0);
			expect(existsSync(path.join(extensions(), UUID))).toBe(false);
		});
	});

	describe('update-and-compile-translations.sh', () => {
		const locale = () => path.join(repo, UUID, 'locale');
		const po = (lang) => path.join(locale(), lang, 'LC_MESSAGES', `${DOMAIN}.po`);
		const mo = (lang) => path.join(locale(), lang, 'LC_MESSAGES', `${DOMAIN}.mo`);
		const update = (env = {}) => run('update-and-compile-translations.sh', [], env);
		const templatePath = () => path.join(locale(), `${DOMAIN}.pot`);
		const changeSource = () => {
			const file = path.join(repo, 'src', 'prefs.ts');
			writeFileSync(file, readFileSync(file, 'utf8').replace('From top to bottom', 'Top to bottom, please'));
		};

		it('is a no-op on an up-to-date project: same files, run after run', () => {
			expect(update().status).toBe(0);
			const first = fingerprint(repo);
			const second = update();
			expect(second.stderr).not.toMatch(/error/i);
			expect(second.status).toBe(0);
			expect(fingerprint(repo)).toBe(first);
		});

		it('keeps the template, with its date, when no message changed', () => {
			update();
			const stamped = readFileSync(templatePath(), 'utf8').replace(
				/"POT-Creation-Date: [^"]*"/,
				'"POT-Creation-Date: 1999-01-01 00:00+0000\\n"',
			);
			writeFileSync(templatePath(), stamped);
			expect(update().status).toBe(0);
			expect(readFileSync(templatePath(), 'utf8')).toBe(stamped);
		});

		it("keeps the template's permissions when it rewrites it", () => {
			update();
			chmodSync(templatePath(), 0o664);
			changeSource();
			update();
			expect(statSync(templatePath()).mode & 0o777).toBe(0o664);
		});

		it('says nothing about git, even in a repository, where xgettext would otherwise complain', () => {
			const git = (...args) =>
				spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.org', ...args], {
					cwd: repo,
					encoding: 'utf8',
				});
			expect(git('init', '-q').status).toBe(0);
			git('add', '-A');
			expect(git('commit', '-q', '-m', 'sandbox').status).toBe(0);
			expect(update().stderr).not.toContain('vc-mtime');
		});

		it('extracts a new message into the template and every catalogue, and recompiles them', () => {
			update();
			changeSource();
			const before = readFileSync(mo('de'));
			const result = update();
			expect(result.status).toBe(0);
			expect(readFileSync(templatePath(), 'utf8')).toContain('msgid "Top to bottom, please"');
			for (const lang of directoriesIn(locale())) {
				const catalogue = readFileSync(po(lang), 'utf8');
				expect(catalogue, lang).toContain('Top to bottom, please');
				const compiled = spawnSync('msgunfmt', [mo(lang)], { encoding: 'utf8' });
				expect(compiled.status, lang).toBe(0);
			}
			expect(readFileSync(mo('de')).equals(before)).toBe(false);
		});

		it('keeps existing translations and flags changed messages as fuzzy', () => {
			update();
			changeSource();
			update();
			const catalogue = readFileSync(po('de'), 'utf8');
			expect(catalogue).toMatch(/#, fuzzy\n#\| msgid "From top to bottom"\nmsgid "Top to bottom, please"/);
			expect(catalogue).toContain('msgid "Emoji Selector"');
		});

		it('leaves no backup files behind', () => {
			update();
			changeSource();
			update();
			expect(walk(repo).filter((file) => file.endsWith('~'))).toEqual([]);
		});

		it('ignores a language directory that has no catalogue', () => {
			mkdirSync(path.join(locale(), 'xx/LC_MESSAGES'), { recursive: true });
			const result = update();
			expect(result.status).toBe(0);
			expect(existsSync(mo('xx'))).toBe(false);
		});

		it('fails, naming the file, when a catalogue is invalid', () => {
			update();
			const file = po('fr');
			const original = readFileSync(file, 'utf8');
			const broken = original.replace(/msgstr "([^"]*%s[^"]*)"/, 'msgstr "no placeholder"');
			expect(broken, 'the test must really break the catalogue').not.toBe(original);
			writeFileSync(file, broken);
			const result = update();
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('locale/fr/LC_MESSAGES');
		});

		it('rejects arguments', () => {
			const result = run('update-and-compile-translations.sh', ['--oops']);
			expect(result.status).toBe(2);
			expect(result.stderr).toMatch(/usage/i);
		});
	});

	describe('with a tool missing', () => {
		// A PATH holding only the commands the scripts need, minus the one under test.
		const TOOLS = [
			'bash',
			'cat',
			'chmod',
			'dirname',
			'find',
			'glib-compile-schemas',
			'grep',
			'mkdir',
			'mktemp',
			'mv',
			'msgfmt',
			'msgmerge',
			'rm',
			'sed',
			'sort',
			'unzip',
			'xgettext',
			'zip',
		];
		const withoutTool = (missing) => {
			const bin = path.join(base, `bin without ${missing}`);
			mkdirSync(bin);
			for (const tool of TOOLS.filter((t) => t !== missing)) {
				const found = spawnSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
				expect(found, tool).not.toBe('');
				symlinkSync(found, path.join(bin, tool));
			}
			return bin;
		};

		it.each([
			['build-a-zip.sh', 'zip'],
			['build-a-zip.sh', 'find'],
			['build-a-zip.sh', 'sed'],
			['build-a-zip.sh', 'sort'],
			['install.sh', 'unzip'],
			['install.sh', 'glib-compile-schemas'],
			['update-and-compile-translations.sh', 'xgettext'],
			['update-and-compile-translations.sh', 'msgmerge'],
			['update-and-compile-translations.sh', 'msgfmt'],
			['update-and-compile-translations.sh', 'grep'],
		])('%s names the missing %s and changes nothing', (script, tool) => {
			const before = fingerprint(repo);
			const result = run(script, [], { PATH: withoutTool(tool), EXTENSIONS_DIR: path.join(base, 'ext') });
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(tool);
			expect(fingerprint(repo)).toBe(before);
			expect(existsSync(path.join(base, 'ext'))).toBe(false);
		});
	});

	describe('all scripts', () => {
		it.each(ALL_SHELL_SCRIPTS)('%s starts with a safe shell setup', (script) => {
			const source = readFileSync(path.join(ROOT, script), 'utf8');
			expect(source.startsWith('#!/usr/bin/env bash\n')).toBe(true);
			expect(source).toMatch(/^set -euo pipefail$/m);
		});

		it.each(['build-a-zip.sh', 'install.sh'])(
			'%s sets its cleanup trap before it creates anything to clean up',
			(script) => {
				const lines = readFileSync(path.join(ROOT, script), 'utf8')
					.split('\n')
					.filter((line) => !line.trim().startsWith('#'));
				const firstTrap = lines.findIndex((line) => line.startsWith('trap '));
				const firstCreation = lines.findIndex((line) => /\b(mktemp|mkdir)\b/.test(line) && !line.includes('trap'));
				expect(firstTrap).toBeGreaterThan(-1);
				expect(firstTrap).toBeLessThan(firstCreation);
			},
		);

		it.each(ALL_SHELL_SCRIPTS)('%s never removes a path that could be empty or relative', (script) => {
			const source = readFileSync(path.join(ROOT, script), 'utf8');
			const removals = source.split('\n').filter((line) => /\brm\b/.test(line) && !line.trim().startsWith('#'));
			for (const line of removals) {
				expect(line, line).toMatch(/\$\{[a-z_]+:\?[^}]*\}/i);
			}
		});
	});
});
