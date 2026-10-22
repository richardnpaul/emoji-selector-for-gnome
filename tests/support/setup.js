import { beforeEach } from 'vitest';

import { resetShell, shellGlobal } from './shell-state.js';

// The Shell's `global` object, which the sources use directly.
globalThis.global = shellGlobal;

beforeEach(() => {
	resetShell();
});
