// Vitest configuration used by Stryker (see stryker.config.json): the normal one, minus the tests that
// read the instrumented sources as text or run external tools on them (`*.tooling.test.js`: xgettext, the
// static source contract, real GTK4...). Stryker instruments the sources, so those would see mutated code,
// and they never execute extension logic, so they cannot kill a mutant anyway.
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config.mjs';

export default mergeConfig(
	base,
	defineConfig({ test: { exclude: ['**/node_modules/**', '**/*.real.test.js', '**/*.tooling.test.js'] } }),
);
