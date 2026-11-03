// Builds the extension for real (TypeScript compiler, emoji name data, packaging script, `gnome-extensions install`: the steps the README gives) in a temporary
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
	cpSync(EXTENSION_DIR, path.join(repo, 'assets'), { recursive: true });
	cpSync(path.join(ROOT, 'build-a-zip.sh'), path.join(repo, 'build-a-zip.sh'));
	chmodSync(path.join(repo, 'build-a-zip.sh'), 0o755);
	run(
		path.join(ROOT, 'node_modules/.bin/tsc'),
		['-p', 'tsconfig.build.json', '--outDir', path.join(repo, 'dist', 'extension')],
		{
			cwd: ROOT,
		},
	);
	run('node', [path.join(ROOT, 'translations/tools/names.mjs'), path.join(repo, 'dist', 'extension')], { cwd: ROOT });
	const env = { PATH: process.env.PATH, HOME: path.join(base, 'home') };
	const zips = path.join(base, 'zips');
	run('bash', [path.join(repo, 'build-a-zip.sh'), zips], { cwd: base, env });
	const xdgDataHome = path.join(base, 'data home');
	run('gnome-extensions', ['install', '--force', path.join(zips, `${UUID}.zip`)], {
		cwd: base,
		env: { ...env, XDG_DATA_HOME: xdgDataHome },
	});
	const extensions = path.join(xdgDataHome, 'gnome-shell', 'extensions');
	return { xdgDataHome, installed: path.join(extensions, UUID) };
}
