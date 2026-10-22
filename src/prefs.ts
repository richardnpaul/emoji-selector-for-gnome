import Adw from 'gi://Adw';
import type Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// These are the ranges of the schema, which GSettings enforces anyway.
const COLUMNS = { lower: 10, upper: 60 };
const EMOJI_SIZE = { lower: 10, upper: 100 };

const POSITIONS = ['top', 'bottom'] as const;
const DEFAULT_SHORTCUT = '<Super>period';
const KEY_NAMES_URL = 'https://raw.githubusercontent.com/GNOME/gtk/master/gdk/keynames.txt';

const AUTHOR = 'Romain F. T.';
const CONTRIBUTORS = ['Jimmy Scionti', 'Ryan Gonzalez', 'xurizaemon', 'Fran Diéguez'];

/**
 * What the pages need from the window the Shell gives them (an Adw.PreferencesWindow; the newer
 * Adw.PreferencesDialog is not what the Shell hands out, and it has the same methods).
 */
interface PreferencesHost {
  add(page: Adw.PreferencesPage): void;
  get_display(): Gdk.Display;
}

/** The preferences window: where the menu is, how big it is, and the keyboard shortcut. */
export default class EmojiSelectorPreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: PreferencesHost): Promise<void> {
    const settings = this.getSettings();
    window.add(layoutPage(settings));
    window.add(shortcutPage(settings, window));
    // (The metadata is an open record; only the web page of the extension matters here.)
    window.add(aboutPage((this.metadata as { url?: string }).url, window));
    return Promise.resolve();
  }
}

/** The text of a title or description, which libadwaita reads as Pango markup (`<Super>` is not). */
function markup(text: string): string {
  return GLib.markup_escape_text(text, -1);
}

function spinRow(settings: Gio.Settings, key: string, title: string, range: { lower: number; upper: number }) {
  const row = new Adw.SpinRow({
    use_markup: false,
    title,
    adjustment: new Gtk.Adjustment({ ...range, step_increment: 1, page_increment: 10 }),
  });
  settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function layoutPage(settings: Gio.Settings): Adw.PreferencesPage {
  const group = new Adw.PreferencesGroup();

  const position = new Adw.ComboRow({
    use_markup: false,
    title: _('General layout'),
    subtitle: _(
      'Displaying the interface from the bottom is better if you use a bottom panel instead of the default top bar.',
    ),
    model: Gtk.StringList.new([_('From top to bottom'), _('From bottom to top')]),
  });
  const showPosition = () => {
    const current = settings.get_string('position');
    position.selected = Math.max(
      0,
      POSITIONS.findIndex((candidate) => candidate === current),
    );
  };
  showPosition();
  position.connect('notify::selected', () => {
    const chosen = POSITIONS[position.selected];
    if (chosen !== undefined) {
      settings.set_string('position', chosen);
    }
  });
  const changed = settings.connect('changed::position', showPosition);
  group.add(position);

  group.add(spinRow(settings, 'nbcols', _('Number of emojis per line'), COLUMNS));
  group.add(spinRow(settings, 'emojisize', _('Size of emojis (px)'), EMOJI_SIZE));

  const page = new Adw.PreferencesPage({ title: _('Layout'), icon_name: 'view-grid-symbolic' });
  page.add(group);
  page.connect('destroy', () => {
    settings.disconnect(changed);
  });
  return page;
}

function shortcutPage(settings: Gio.Settings, window: PreferencesHost): Adw.PreferencesPage {
  const group = new Adw.PreferencesGroup({
    description: markup(
      [
        _('Modifier keys must be between chevrons'),
        _('The default value is %s').replace('%s', DEFAULT_SHORTCUT),
        _("Don't use a keyboard shortcut that already exists."),
      ].join('\n'),
    ),
  });

  const useShortcut = new Adw.SwitchRow({ use_markup: false, title: _('Use a keyboard shortcut to toggle the menu') });
  settings.bind('use-keybinding', useShortcut, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(useShortcut);

  const shortcut = new Adw.EntryRow({
    use_markup: false,
    title: _('Keyboard shortcut'),
    show_apply_button: true,
    text: settings.get_strv('emoji-keybinding')[0] ?? '',
  });
  shortcut.connect('apply', () => {
    const text = shortcut.text.trim();
    // (GTK accepts modifiers alone, `<Super>`, as an accelerator with the key 0.)
    const [parsed, key] = Gtk.accelerator_parse(text);
    if (text !== '' && !(parsed && key !== 0)) {
      shortcut.add_css_class('error');
      return;
    }
    shortcut.remove_css_class('error');
    settings.set_strv('emoji-keybinding', text === '' ? [] : [text]);
  });
  const changed = settings.connect('changed::emoji-keybinding', () => {
    shortcut.text = settings.get_strv('emoji-keybinding')[0] ?? '';
  });
  group.add(shortcut);
  group.add(linkRow(window, _('List of valid key names'), KEY_NAMES_URL));

  const alwaysShow = new Adw.SwitchRow({
    use_markup: false,
    title: _('Always show the icon in the panel'),
    subtitle: _("If you access the menu with the keyboard shortcut, you don't need to always display the icon."),
  });
  settings.bind('always-show', alwaysShow, 'active', Gio.SettingsBindFlags.DEFAULT);
  const options = new Adw.PreferencesGroup();
  options.add(alwaysShow);

  const syncSensitivity = () => {
    shortcut.sensitive = useShortcut.active;
    alwaysShow.sensitive = useShortcut.active;
    if (!useShortcut.active) {
      // Without the shortcut, the icon is the only way to open the menu.
      alwaysShow.active = true;
    }
  };
  syncSensitivity();
  useShortcut.connect('notify::active', syncSensitivity);

  const page = new Adw.PreferencesPage({ title: _('Keyboard bindings'), icon_name: 'input-keyboard-symbolic' });
  page.add(group);
  page.add(options);
  page.connect('destroy', () => {
    settings.disconnect(changed);
  });
  return page;
}

function aboutPage(url: string | undefined, window: PreferencesHost): Adw.PreferencesPage {
  const group = new Adw.PreferencesGroup({
    title: markup(_('Emoji Selector')),
    description: markup(
      _(
        'This extension provides a configurable popup menu displaying most emojis, clicking on an emoji copies it to the clipboard.',
      ),
    ),
  });
  group.add(new Adw.ActionRow({ use_markup: false, title: _('Author'), subtitle: AUTHOR }));
  const translators = _('translator-credits');
  if (translators !== 'translator-credits') {
    group.add(new Adw.ActionRow({ use_markup: false, title: _('Translator(s)'), subtitle: translators }));
  }
  group.add(new Adw.ActionRow({ use_markup: false, title: _('Contributors'), subtitle: CONTRIBUTORS.join('\n') }));
  if (url !== undefined) {
    group.add(linkRow(window, _('Report bugs or ideas'), url));
  }

  const page = new Adw.PreferencesPage({ title: _('About'), icon_name: 'help-about-symbolic' });
  page.add(group);
  return page;
}

/** A row which opens a web page. */
function linkRow(window: PreferencesHost, title: string, uri: string): Adw.ActionRow {
  const row = new Adw.ActionRow({ use_markup: false, title, subtitle: uri, activatable: true });
  row.add_suffix(new Gtk.Image({ icon_name: 'adw-external-link-symbolic' }));
  row.connect('activated', () => {
    try {
      Gio.AppInfo.launch_default_for_uri(uri, window.get_display().get_app_launch_context());
    } catch (error) {
      console.error(`Cannot open ${uri}`, error);
    }
  });
  return row;
}
