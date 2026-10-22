import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Clipboard } from './clipboard.js';
import type { Emoji } from './emoji.js';
import type { CopyMode, EmojiContext } from './emojiButton.js';
import { EmojiCategory, type CategoryDefinition, type CategoryHost } from './emojiCategory.js';
import { EmojiSearchItem, type SearchScope } from './emojiSearchItem.js';
import type { EmojiSettings } from './settings.js';

// How long to wait after the menu opened for the search entry to take the keyboard focus.
const FOCUS_DELAY_MS = 20;

/** The names are translated when the menu is created, which is after the translations are loaded. */
function categoryLabels(): [name: string, icon: string, picker: CategoryDefinition['picker']][] {
  return [
    [_('Smileys & Body'), 'face-smile-symbolic', 'tones'],
    [_('Peoples & Clothing'), 'emoji-people-symbolic', 'tones-and-genders'],
    [_('Animals & Nature'), 'emoji-nature-symbolic', null],
    [_('Food & Drink'), 'emoji-food-symbolic', null],
    [_('Travel & Places'), 'emoji-travel-symbolic', null],
    [_('Activities & Sports'), 'emoji-activities-symbolic', 'tones-and-genders'],
    [_('Objects'), 'emoji-objects-symbolic', null],
    [_('Symbols'), 'emoji-symbols-symbolic', null],
    [_('Flags'), 'emoji-flags-symbolic', null],
  ];
}

/** The icon of a category: a name from the icon theme, or a file of the extension. */
function categoryIcon(name: string, iconDir: string): Gio.Icon {
  return Gio.icon_new_for_string(name.startsWith('emoji-') ? `${iconDir}/${name}.svg` : name);
}

/**
 * The button in the top panel and its menu: a row of category buttons, the search entry, the row of
 * recently used emojis (or search results), and the categories themselves, which are shown one at a time.
 */
export class EmojiMenu implements CategoryHost, SearchScope {
  readonly button: PanelMenu.Button;
  readonly categories: EmojiCategory[];
  readonly searchItem: EmojiSearchItem;
  /** The menu item holding the category buttons. */
  readonly headerItem: PopupMenu.PopupBaseMenuItem;
  readonly #settings: EmojiSettings;
  readonly #clipboard = new Clipboard();
  #activeCategory = -1;
  #focusTimer: number | null = null;

  /** `catalogue` has the emojis of each category, `iconDir` is where the extension's icons are. */
  constructor(settings: EmojiSettings, catalogue: readonly (readonly Emoji[])[], iconDir: string) {
    this.#settings = settings;
    const context: EmojiContext = {
      settings,
      copy: (emoji, mode) => {
        this.#copy(emoji, mode);
      },
    };

    this.button = new PanelMenu.Button(0.0, _('Emoji Selector'), false);
    const box = new St.BoxLayout();
    box.add_child(new St.Icon({ icon_name: 'face-cool-symbolic', style_class: 'system-status-icon' }));
    this.button.add_child(box);
    this.button.visible = settings.alwaysShow;

    const columns = settings.columns;
    this.categories = categoryLabels().map(
      ([name, icon, picker], id) =>
        new EmojiCategory(
          context,
          this,
          { id, name, icon: categoryIcon(icon, iconDir), emojis: catalogue[id] ?? [], picker },
          columns,
        ),
    );

    this.headerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    this.categories.forEach((category) => {
      this.headerItem.add_child(category.button);
    });
    this.searchItem = new EmojiSearchItem(context, this, columns);

    const menu = this.#popup;
    if (settings.position === 'top') {
      menu.addMenuItem(this.headerItem);
      menu.addMenuItem(this.searchItem.searchItem);
      menu.addMenuItem(this.searchItem.recentsItem);
    }
    this.categories.forEach((category) => {
      menu.addMenuItem(category.item);
    });
    if (settings.position === 'bottom') {
      menu.addMenuItem(this.searchItem.recentsItem);
      menu.addMenuItem(this.searchItem.searchItem);
      menu.addMenuItem(this.headerItem);
    }

    menu.connect('open-state-changed', (_menu: unknown, open: boolean) => {
      this.#onOpenStateChanged(open);
    });
  }

  toggle(): void {
    this.#popup.toggle();
  }

  /** Shows the button if "always show" is on, and while the menu is open. */
  refreshVisibility(): void {
    this.button.visible = this.#popup.isOpen || this.#settings.alwaysShow;
  }

  setEmojiSize(size: number): void {
    this.searchItem.setEmojiSize(size);
    this.categories.forEach((category) => {
      category.setEmojiSize(size);
    });
  }

  clearCategories(): void {
    this.categories.forEach((category) => {
      category.close();
    });
    this.#activeCategory = -1;
    this.searchItem.refresh();
  }

  categoryOpened(id: number): void {
    this.#activeCategory = id;
    this.searchItem.refresh();
  }

  categoriesToSearch(): readonly EmojiCategory[] {
    return this.#activeCategory === -1 ? this.categories : this.categories.filter((c) => c.id === this.#activeCategory);
  }

  /** (Destroying the button closes its menu, which stops the pending focus.) */
  destroy(): void {
    this.button.destroy();
  }

  get #popup(): PopupMenu.PopupMenu {
    // (The button is created with a menu, so it is a full popup menu, not the dummy one.)
    return this.button.menu as PopupMenu.PopupMenu;
  }

  #copy(emoji: string, mode: CopyMode): void {
    if (mode === 'append') {
      this.#clipboard.append(emoji);
    } else {
      this.#clipboard.replace(emoji);
    }
    this.searchItem.recordUse(emoji);
    if (mode === 'replace-and-close') {
      this.#popup.close();
    }
  }

  /** Starts each opening from a clean state, with the search entry focused. */
  #onOpenStateChanged(open: boolean): void {
    this.refreshVisibility();
    this.clearCategories();
    this.searchItem.clear();
    this.#cancelFocus();
    if (open) {
      this.#focusTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_DELAY_MS, () => {
        this.#focusTimer = null;
        global.stage.set_key_focus(this.searchItem.entry);
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  #cancelFocus(): void {
    if (this.#focusTimer !== null) {
      GLib.Source.remove(this.#focusTimer);
      this.#focusTimer = null;
    }
  }
}
