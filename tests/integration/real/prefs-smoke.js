// Run with: xvfb-run -a gjs -m tests/integration/real/prefs-smoke.js [rtl]
// (XDG_DATA_HOME must hold the installed extension and GSETTINGS_BACKEND=memory is advisable.)
//
// Opens the extension's REAL preferences, from the installed package, in the REAL libadwaita and the real
// Extensions app's preferences module, drives the widgets the way a user does and prints what happened
// as JSON, so that a test can check it (and check the fakes used by the unit tests against reality).
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { programArgs } from 'system';

const UUID = 'emoji-selector@maestroschan.fr';
const root = `${GLib.getenv('XDG_DATA_HOME')}/gnome-shell/extensions/${UUID}`;
const metadata = JSON.parse(
	new TextDecoder().decode(Gio.File.new_for_path(`${root}/metadata.json`).load_contents(null)[1]),
);

// The module that the Extensions app (a separate process from the Shell) offers to preferences.
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
Adw.init();
if (programArgs.includes('rtl')) {
	Gtk.Widget.set_default_direction(Gtk.TextDirection.RTL);
}

const { default: Preferences } = await import(`file://${root}/prefs.js`);
const preferences = new Preferences({ ...metadata, dir: Gio.File.new_for_path(root), path: root });
// The module's gettext() finds the extension through the Extensions app's manager.
const { extensionManager } = await import('resource:///org/gnome/Shell/Extensions/js/extensionsService.js');
extensionManager.lookup = () => ({ stateObj: preferences });

const settings = preferences.getSettings();
const window = new Adw.PreferencesWindow();
await preferences.fillPreferencesWindow(window);

/** Every widget below `widget`, depth first. */
function* descendants(widget) {
	for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
		yield child;
		yield* descendants(child);
	}
}
const all = [...descendants(window)];
const rows = Object.fromEntries(all.filter((w) => w instanceof Adw.PreferencesRow).map((w) => [w.title, w]));
const pages = all.filter((w) => w instanceof Adw.PreferencesPage);
const groups = all.filter((w) => w instanceof Adw.PreferencesGroup);

const range = (key) => settings.settings_schema.get_key(key).get_range().deepUnpack()[1].deepUnpack();
const report = {
	direction: window.get_direction() === Gtk.TextDirection.RTL ? 'rtl' : 'ltr',
	pages: pages.map((page) => page.title),
	titles: Object.keys(rows),
	groupDescriptions: groups.map((group) => group.description),
	groupTitles: groups.map((group) => group.title),
};

// -- Layout
const position = rows['General layout'];
report.position = {
	items: Array.from({ length: position.model.get_n_items() }, (_, i) => position.model.get_string(i)),
	initial: position.selected,
};
position.selected = 1;
report.position.afterChoosingBottom = settings.get_string('position');
settings.set_string('position', 'top');
report.position.afterSettingTop = position.selected;

report.spins = {};
for (const [title, key] of [
	['Number of emojis per line', 'nbcols'],
	['Size of emojis (px)', 'emojisize'],
]) {
	const row = rows[title];
	const entry = { initial: row.value, adjustment: [row.adjustment.lower, row.adjustment.upper], schema: range(key) };
	row.value = row.adjustment.lower + 2;
	entry.afterChoosing = settings.get_int(key);
	settings.set_int(key, row.adjustment.lower + 5);
	entry.afterSetting = row.value;
	row.value = 100000;
	entry.afterTooBig = [row.value, settings.get_int(key)];
	report.spins[key] = entry;
}

// -- Keyboard bindings
const useShortcut = rows['Use a keyboard shortcut to toggle the menu'];
const entry = rows['Keyboard shortcut'];
const alwaysShow = rows['Always show the icon in the panel'];
report.shortcut = { initialText: entry.text, initialSwitch: useShortcut.active, applyButton: entry.show_apply_button };
const apply = (text) => {
	entry.text = text;
	entry.emit('apply');
	return { stored: settings.get_strv('emoji-keybinding'), error: entry.has_css_class('error') };
};
report.shortcut.valid = apply('<Control><Alt>e');
report.shortcut.invalid = apply('not a shortcut');
report.shortcut.empty = apply('');
settings.set_strv('emoji-keybinding', ['<Super>period']);
report.shortcut.afterSetting = entry.text;
report.parse = Object.fromEntries(
	['<Super>period', '<Control><Alt>e', 'F12', '<Super>1', 'KP_1', 'not a shortcut', '<Super>', 'period period', ''].map(
		(text) => [text, Gtk.accelerator_parse(text).slice(0, 2).map(String).join(' ')],
	),
);

alwaysShow.active = false;
useShortcut.active = false;
report.shortcut.withoutShortcut = {
	useKeybinding: settings.get_boolean('use-keybinding'),
	alwaysShow: settings.get_boolean('always-show'),
	alwaysShowRow: alwaysShow.active,
	entrySensitive: entry.sensitive,
	alwaysShowSensitive: alwaysShow.sensitive,
};
useShortcut.active = true;
report.shortcut.withShortcut = { entrySensitive: entry.sensitive, alwaysShowSensitive: alwaysShow.sensitive };

// -- About
report.about = {
	author: rows['Author'].subtitle,
	contributors: rows['Contributors'].subtitle,
	link: rows['Report bugs or ideas'].subtitle,
	linkActivatable: rows['Report bugs or ideas'].activatable,
	keyNames: rows['List of valid key names'].subtitle,
};

// -- Showing it, which realises every widget.
window.present();
await new Promise((resolve) => {
	GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
		resolve();
		return GLib.SOURCE_REMOVE;
	});
});
report.mapped = window.get_mapped();
window.destroy();

print(JSON.stringify(report));
