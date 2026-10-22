import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const support = path.join(root, 'tests/support');

export default defineConfig({
	resolve: {
		// The TypeScript sources import GNOME libraries by URL; tests get fakes (see tests/support).
		alias: [
			{ find: /^gi:\/\/(\w+)(\?.*)?$/, replacement: path.join(support, 'gi/$1.js') },
			{ find: /^resource:\/\/\/org\/gnome\/shell\/(.+)\.js$/, replacement: path.join(support, 'shell/$1.js') },
			{
				find: /^resource:\/\/\/org\/gnome\/Shell\/Extensions\/js\/extensions\/(.+)\.js$/,
				replacement: path.join(support, 'prefs/$1.js'),
			},
		],
	},
	test: {
		setupFiles: [path.join(support, 'setup.js')],
		environment: 'node',
		include: ['tests/**/*.test.js'],
		// Tests that start Xvfb/GJS/gettext processes are slow when the whole suite runs in parallel.
		testTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov', 'json-summary'],
			reportsDirectory: 'coverage',
			include: ['src/**/*.ts', 'scripts/**/*.mjs'],
			thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
		},
	},
});
