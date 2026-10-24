// The state of the fake GNOME Shell used by the TypeScript sources' tests. Every `gi://…` and
// `resource:///…` import in src/ is aliased (vitest.config.mjs) to a module under tests/support that
// re-exports one of these singletons, so a test can inspect and drive them. `resetShell()` runs
// before every test (tests/support/setup.js).
import * as toolkit from './fakes/toolkit.js';
import { launcher } from './gi/Gio.js';

export const glib = toolkit.createGLib();
export const main = toolkit.createMain();
export const shellGlobal = toolkit.createGlobal();
export const clipboard = toolkit.Clipboard.get_default();

/** What the Extension base class provides to the extension under test; tests set these. */
export const extensionState = {
	settings: null,
	path: '/fake/extensions/emoji-selector@example.org',
	translate: (text) => text,
};

export function resetShell() {
	glib.reset();
	main.panel.statusArea.clear();
	main.wm.keybindings.clear();
	shellGlobal.stage.keyFocus = null;
	shellGlobal.pointer = [0, 0, 0];
	toolkit.Actor.registry = [];
	clipboard.reset();
	launcher.reset();
	extensionState.settings = null;
	extensionState.translate = (text) => text;
}
