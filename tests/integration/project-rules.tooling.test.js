// Rules about the project itself, enforced mechanically: the documentation only names commands
// that exist, and the quality gates cannot be quietly weakened.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCEPTED_FINDINGS } from '../../scripts/lib/shexli-accepted.mjs';
import vitestConfig from '../../vitest.config.mjs';
import { EXTENSION_DIR, METADATA } from '../support/paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const PACKAGE = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const STRYKER = JSON.parse(readFileSync(path.join(ROOT, 'stryker.config.json'), 'utf8'));

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'coverage', 'reports', 'dist', '.stryker-tmp']);
const markdownFiles = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory()) {
			return SKIPPED_DIRECTORIES.has(entry.name) ? [] : markdownFiles(path.join(dir, entry.name));
		}
		return entry.name.endsWith('.md') ? [path.join(dir, entry.name)] : [];
	});

describe('documentation', () => {
	const mentioned = markdownFiles(ROOT).flatMap((file) => {
		const text = readFileSync(file, 'utf8');
		return [...text.matchAll(/\bnpm run ([\w:-]+)/g)].map((m) => ({ script: m[1], file: path.relative(ROOT, file) }));
	});

	it('finds the commands it documents', () => {
		expect(mentioned.length).toBeGreaterThan(20);
		expect(mentioned.map((m) => m.script)).toContain('test:mutation');
	});

	it('only names npm scripts that exist', () => {
		expect(mentioned.filter(({ script }) => !(script in PACKAGE.scripts))).toEqual([]);
	});
});

describe('quality gates', () => {
	it('require 100% coverage', () => {
		expect(vitestConfig.test.coverage.thresholds).toEqual({
			statements: 100,
			branches: 100,
			functions: 100,
			lines: 100,
		});
	});

	it('require a 100% mutation score', () => {
		expect(STRYKER.thresholds).toEqual({ high: 100, low: 100, break: 100 });
	});

	it('mutate all the code, data included, with no exclusion', () => {
		expect(STRYKER.mutate).toEqual(['src/**/*.ts', 'scripts/**/*.mjs']);
		expect(STRYKER.mutate.some((pattern) => pattern.startsWith('!'))).toBe(false);
		expect(STRYKER.ignoreStatic).toBeUndefined();
	});

	it('measure coverage of all the code too', () => {
		expect(vitestConfig.test.coverage.include).toEqual(['src/**/*.ts', 'scripts/**/*.mjs']);
		expect(vitestConfig.test.coverage.exclude).toBeUndefined();
	});

	it('are run by a hook before pushing, thresholds included', () => {
		const config = readFileSync(path.join(ROOT, '.pre-commit-config.yaml'), 'utf8');
		expect(config).toMatch(/entry: npm run test:coverage\n(?:.*\n)*?\s+stages: \[pre-push\]/);
	});
});

describe('the package', () => {
	it('supports GNOME Shell 45 to 51, with no version of its own (extensions.gnome.org numbers uploads)', () => {
		expect(METADATA['shell-version']).toEqual(['45', '46', '47', '48', '49', '50', '51']);
		expect(METADATA).not.toHaveProperty('version');
	});

	it('compiles to exactly the files that the packaging script ships', () => {
		const out = mkdtempSync(path.join(os.tmpdir(), 'emoji-tsc-'));
		try {
			const tsc = spawnSync(
				path.join(ROOT, 'node_modules/.bin/tsc'),
				['-p', 'tsconfig.build.json', '--outDir', path.join(out, 'compiled')],
				{ cwd: ROOT, encoding: 'utf8' },
			);
			expect(tsc.stdout + tsc.stderr).toBe('');
			const walk = (dir) =>
				readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
					entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
				);
			const emitted = walk(path.join(out, 'compiled')).map((file) => path.relative(path.join(out, 'compiled'), file));
			const sources = walk(path.join(ROOT, 'src')).map((file) => path.relative(path.join(ROOT, 'src'), file));
			expect(emitted.sort()).toEqual(sources.map((file) => file.replace(/\.ts$/, '.js')).sort());
			expect(emitted).toEqual(expect.arrayContaining(['extension.js', 'prefs.js']));
			const script = readFileSync(path.join(ROOT, 'build-a-zip.sh'), 'utf8');
			const shipped = new RegExp(`^${/COMPILED_PATHS='\\\.\/(.*)'$/m.exec(script)[1]}$`);
			expect(emitted.filter((file) => !shipped.test(file))).toEqual([]);
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	}, 60_000);

	it('only accepts findings of the review linter with a reason', () => {
		expect(ACCEPTED_FINDINGS.length).toBeGreaterThan(0);
		for (const entry of ACCEPTED_FINDINGS) {
			expect(entry.rule_id).toMatch(/^EGO-[A-Z]-\d{3}$/);
			expect(entry.snippet.trim()).not.toBe('');
			expect(entry.reason.length, entry.rule_id).toBeGreaterThan(40);
		}
	});
});

describe('supply chain: everything is locked', () => {
	const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
	const SHA = /^[0-9a-f]{40}$/;
	const workflows = () =>
		existsSync(path.join(ROOT, '.github/workflows'))
			? readdirSync(path.join(ROOT, '.github/workflows')).filter((name) => /\.ya?ml$/.test(name))
			: [];
	const exactVersions = (dependencies = {}) =>
		Object.entries(dependencies).filter(([, version]) => !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version));

	describe('GitHub Actions', () => {
		it('has a workflow', () => {
			expect(workflows()).toContain('ci.yml');
		});

		it.each(['ci.yml'])('%s pins every action to a full commit SHA, with its version in a comment', (name) => {
			const uses = [...read(`.github/workflows/${name}`).matchAll(/^\s*(?:-\s+)?uses:\s*(\S+?)@(\S+)(.*)$/gm)];
			expect(uses.length).toBeGreaterThan(0);
			for (const [, action, ref, rest] of uses) {
				expect(ref, action).toMatch(SHA);
				expect(rest, `${action} needs "# vX.Y.Z"`).toMatch(/#\s*v\d+\.\d+\.\d+/);
			}
		});

		it.each(['ci.yml'])('%s runs with read-only token permissions and no persisted credentials', (name) => {
			const text = read(`.github/workflows/${name}`);
			expect(text).toMatch(/^permissions:\n\s+contents: read$/m);
			const checkouts = text.split('actions/checkout@').slice(1);
			expect(checkouts.length).toBeGreaterThan(0);
			for (const checkout of checkouts) {
				expect(checkout.split(/\n\s*-\s+(?:name|uses|run):/)[0]).toMatch(/persist-credentials: false/);
			}
		});

		it('is kept up to date by Dependabot (actions, npm, docker, pip)', () => {
			const dependabot = read('.github/dependabot.yml');
			for (const ecosystem of ['github-actions', 'npm', 'docker', 'pip']) {
				expect(dependabot, ecosystem).toContain(`package-ecosystem: ${ecosystem}`);
			}
		});
	});

	describe('pre-commit', () => {
		it('pins every hook repository to a commit SHA', () => {
			const revisions = [...read('.pre-commit-config.yaml').matchAll(/^\s+rev:\s*(\S+)/gm)].map((m) => m[1]);
			expect(revisions.length).toBeGreaterThanOrEqual(4);
			expect(revisions.filter((rev) => !SHA.test(rev))).toEqual([]);
		});

		it('requires the pre-commit version the dev container pins', () => {
			const pinned = /^pre-commit==(\S+)/m.exec(read('.devcontainer/requirements.in'))[1];
			expect(read('.pre-commit-config.yaml')).toContain(`minimum_pre_commit_version: '${pinned}'`);
		});
	});

	describe('npm', () => {
		it.each(['package.json', '.devcontainer/claude-code/package.json'])('%s lists exact versions only', (file) => {
			const manifest = JSON.parse(read(file));
			expect(exactVersions(manifest.dependencies)).toEqual([]);
			expect(exactVersions(manifest.devDependencies)).toEqual([]);
		});

		it.each(['package-lock.json', '.devcontainer/claude-code/package-lock.json'])(
			'%s exists, with an integrity hash for every downloaded package',
			(file) => {
				const lock = JSON.parse(read(file));
				expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3);
				const downloaded = Object.entries(lock.packages).filter(([name, info]) => name !== '' && info.resolved);
				expect(downloaded.length).toBeGreaterThan(0);
				expect(downloaded.filter(([, info]) => !info.integrity).map(([name]) => name)).toEqual([]);
				expect(
					downloaded
						.filter(([, info]) => !info.resolved.startsWith('https://registry.npmjs.org/'))
						.map(([name]) => name),
				).toEqual([]);
			},
		);

		it('keeps lifecycle scripts off for the project, and says why for the one exception', () => {
			expect(read('.npmrc')).toMatch(/^ignore-scripts=true$/m);
			expect(read('.devcontainer/Dockerfile')).toMatch(
				/claude-code[^\n]*\n?[^\n]*lifecycle|lifecycle[^\n]*\n[^\n]*claude/i,
			);
		});
	});

	describe('dev container image', () => {
		const dockerfile = () => read('.devcontainer/Dockerfile');

		it('is built from a base image pinned by digest', () => {
			const bases = [...dockerfile().matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
			expect(bases.length).toBeGreaterThan(0);
			expect(bases.filter((image) => !/@sha256:[0-9a-f]{64}$/.test(image))).toEqual([]);
		});

		it('installs Python tools only from a requirements file with hashes', () => {
			expect(dockerfile()).not.toMatch(/pipx install/);
			expect(dockerfile()).toMatch(/pip install[^\n]*--require-hashes[^\n]*-r[^\n]*requirements\.txt/);
			const requirements = read('.devcontainer/requirements.txt');
			const entries = requirements.split(/\n(?=\S)/).filter((entry) => /^[A-Za-z0-9_.-]+==/.test(entry));
			expect(entries.length).toBeGreaterThan(3);
			expect(entries.filter((entry) => !/--hash=sha256:[0-9a-f]{64}/.test(entry))).toEqual([]);
		});

		it('installs npm tools only from a lockfile', () => {
			expect(dockerfile()).not.toMatch(/npm install/);
			expect(dockerfile()).toMatch(/npm ci/);
		});

		it('downloads and runs nothing unverified', () => {
			expect(dockerfile()).not.toMatch(/curl[^\n]*\|\s*(ba)?sh|wget[^\n]*\|\s*(ba)?sh/);
		});

		it('pins the tools that the Python requirements file is generated from', () => {
			const input = read('.devcontainer/requirements.in');
			for (const tool of ['pre-commit', 'shexli', 'tree-sitter']) {
				expect(input, tool).toMatch(new RegExp(`^${tool}==\\S+$`, 'm'));
			}
		});
	});
});

describe('dev container isolation', () => {
	const devcontainer = () => JSON.parse(readFileSync(path.join(ROOT, '.devcontainer/devcontainer.json'), 'utf8'));

	it('mounts no host directory but the workspace: credentials live in a named volume', () => {
		const { mounts } = devcontainer();
		expect(mounts.length).toBeGreaterThan(0);
		for (const mount of mounts) {
			expect(mount).toMatch(/type=volume/);
			// A volume's source is a name; a host path or a variable such as ${localEnv:HOME} is not one.
			expect(/source=([^,]+)/.exec(mount)[1]).toMatch(/^[A-Za-z][\w.${}-]*$/);
			expect(mount).not.toMatch(/localEnv|source=[/~.]|\$\{HOME\}/);
		}
	});

	it("keeps Claude Code's configuration on that volume", () => {
		const config = devcontainer();
		const target = /target=([^,]+)/.exec(config.mounts.find((m) => m.includes('claude')))[1];
		expect(config.containerEnv.CLAUDE_CONFIG_DIR).toBe(target);
	});

	it("creates the volume's mount point in the image, owned by the container user", () => {
		const dockerfile = readFileSync(path.join(ROOT, '.devcontainer/Dockerfile'), 'utf8');
		expect(dockerfile).toMatch(/install -d -o "?\$\{CONTAINER_USER\}"?[^\n]*\/home\/\$\{CONTAINER_USER\}\/\.claude/);
	});
});
