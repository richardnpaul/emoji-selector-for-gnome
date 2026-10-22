// Builds the extension for real (TypeScript compiler, packaging script, installer) in a temporary
// directory and returns where it was installed, so that tests can run it in the real GNOME libraries
// without touching the working tree.
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { EXTENSION_DIR, METADATA } from './paths.js';

const ROOT = path.resolve(EXTENSION_DIR, '..');
const UUID = METADATA.uuid;

function run(command, args, options) {
	const result = spawnSync(command, args, { encoding: 'utf8', ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
	}
}

/**
 * @param {string} base an empty directory
 * @returns {{ xdgDataHome: string, installed: string }} `installed` is the installed extension
 */
export function buildAndInstall(base) {
	const repo = path.join(base, 'package source');
	mkdirSync(repo, { recursive: true });
	cpSync(EXTENSION_DIR, path.join(repo, UUID), { recursive: true });
	for (const script of ['build-a-zip.sh', 'install.sh']) {
		cpSync(path.join(ROOT, script), path.join(repo, script));
		chmodSync(path.join(repo, script), 0o755);
	}
	run(
		path.join(ROOT, 'node_modules/.bin/tsc'),
		['-p', 'tsconfig.build.json', '--outDir', path.join(repo, 'dist', UUID)],
		{
			cwd: ROOT,
		},
	);
	const xdgDataHome = path.join(base, 'data home');
	const extensions = path.join(xdgDataHome, 'gnome-shell', 'extensions');
	run('bash', [path.join(repo, 'install.sh')], {
		cwd: base,
		env: { PATH: process.env.PATH, HOME: path.join(base, 'home'), EXTENSIONS_DIR: extensions },
	});
	return { xdgDataHome, installed: path.join(extensions, UUID) };
}
