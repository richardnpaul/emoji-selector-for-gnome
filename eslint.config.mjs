import comments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SOURCE = ['src/**/*.ts'];
// Preferences code runs in a separate GTK process; everything else runs inside the Shell.
const PREFERENCES = ['src/prefs.ts', 'src/prefs/**/*.ts'];

export default [
	{ ignores: ['coverage/**', 'reports/**', 'dist/**', '.stryker-tmp/**', 'node_modules/**'] },
	js.configs.recommended,
	{
		linterOptions: { reportUnusedDisableDirectives: 'error' },
		plugins: { comments },
		rules: {
			// No lint suppressions at all: fix the code, or change the rule here, in review.
			'comments/no-use': ['error', { allow: [] }],
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'no-var': 'error',
			'prefer-const': 'error',
		},
	},
	// TypeScript sources: strict, type-aware rules.
	...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map((config) => ({
		...config,
		files: SOURCE,
	})),
	{
		files: SOURCE,
		languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
		rules: {
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
		},
	},
	{
		// EGO rule: nothing from GTK in the Shell process...
		files: SOURCE,
		ignores: PREFERENCES,
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['gi://Gtk*', 'gi://Gdk*', 'gi://Adw*', '**/prefs/*', '**/prefs.js'],
							message: 'GTK must not be loaded in the GNOME Shell process (extensions.gnome.org rejects it).',
						},
					],
				},
			],
		},
	},
	{
		// ...and nothing from the Shell in the preferences process. The only shared module is the settings wrapper.
		files: PREFERENCES,
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'gi://Clutter*',
								'gi://Meta*',
								'gi://St',
								'gi://St?*',
								'gi://Shell*',
								'resource:///org/gnome/shell/*',
							],
							// (The preferences' own base class lives in resource:///org/gnome/Shell/Extensions.)
							caseSensitive: true,
							message: 'Shell libraries cannot be loaded in the preferences process.',
						},
						{
							group: ['**/lib/*', '!**/lib/settings.js'],
							message: 'Preferences may only share the settings wrapper with the Shell side.',
						},
						{ group: ['**/extension.js'], message: 'Preferences must not import the Shell-side extension.' },
					],
				},
			],
		},
	},
	{
		// Tooling and tests run in Node, as ES modules.
		files: ['**/*.mjs', 'tests/**/*.js'],
		ignores: ['tests/integration/real/**'],
		languageOptions: { sourceType: 'module', globals: globals.node },
	},
	{
		// Helper scripts run by GJS (not Node) in the real-GNOME tests, and the extension that drives the real Shell.
		files: ['tests/integration/real/**/*.js'],
		languageOptions: {
			sourceType: 'module',
			globals: { print: 'readonly', console: 'readonly', TextDecoder: 'readonly', global: 'readonly' },
		},
	},
	{
		files: ['tests/**/*.js'],
		plugins: { vitest },
		rules: {
			'vitest/expect-expect': 'error',
			'vitest/no-commented-out-tests': 'error',
			'vitest/no-conditional-expect': 'error',
			'vitest/no-disabled-tests': 'error',
			'vitest/no-duplicate-hooks': 'error',
			'vitest/no-focused-tests': 'error',
			'vitest/no-identical-title': 'error',
			// expect(value, message) is deliberate: it names the case that failed in a loop.
			'vitest/valid-expect': ['error', { maxArgs: 2 }],
			'vitest/valid-title': 'error',
		},
	},
];
