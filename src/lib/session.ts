import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { EMOJIS_CHARACTERS } from '../data/emojisCharacters.js';
import { EMOJIS_KEYWORDS } from '../data/emojisKeywords.js';
import { buildCatalogue, pairUp } from './catalogue.js';
import type { Emoji } from './emoji.js';
import { EmojiMenu } from './emojiMenu.js';
import { type ImportNameData, loadLocalNames } from './localNames.js';
import type { EmojiSettings } from './settings.js';

const KEYBINDING = 'emoji-keybinding';

/** Where the names of the emojis in the language of the user come from. */
export interface LocalNameSource {
  /** The locales of the user, from the most specific to the least (what `GLib.get_language_names()` gives). */
  readonly localeNames: readonly string[];
  readonly importNameData: ImportNameData;
}

/**
 * Everything the extension has while it is enabled: the menu in the panel, the keyboard shortcut, and the
 * reactions to the settings. `end()` takes it all away.
 */
export class Session {
  readonly #settings: EmojiSettings;
  readonly #uuid: string;
  readonly #iconDir: string;
  readonly #catalogue: Emoji[][];
  #menu: EmojiMenu;
  #keybindingAdded = false;
  #ended = false;

  constructor(settings: EmojiSettings, uuid: string, iconDir: string, names: LocalNameSource) {
    this.#settings = settings;
    this.#uuid = uuid;
    this.#iconDir = iconDir;
    this.#catalogue = buildCatalogue(EMOJIS_CHARACTERS, EMOJIS_KEYWORDS);
    this.#menu = this.#newMenu();
    try {
      this.#addToPanel(this.#menu);
      this.#syncKeybinding();
      this.#watchSettings();
    } catch (error) {
      // Nothing else would take away what was set up so far: `enable()` failed, so `disable()` has no session.
      this.end();
      throw error;
    }
    void this.#localise(names);
  }

  end(): void {
    this.#ended = true;
    this.#removeKeybinding();
    this.#settings.disconnectAll();
    this.#menu.destroy();
  }

  /**
   * Names the emojis in the language of the user, once the data is loaded (which the menu does not wait
   * for: it works in English until then). The names are looked up when the search runs or an emoji is
   * hovered, so no widget needs to be rebuilt.
   */
  async #localise(names: LocalNameSource): Promise<void> {
    const loaded = await loadLocalNames(names.localeNames, names.importNameData);
    if (loaded === null || this.#ended) {
      return;
    }
    const { key, data } = loaded;
    const emojis = this.#catalogue.flat();
    let named: [Emoji, string][];
    try {
      named = pairUp(emojis, data, () => new Error(`'${key}' has ${data.length} names for ${emojis.length} emojis`));
    } catch (error) {
      console.error("Ignoring the emoji names of the user's language", error);
      return;
    }
    for (const [emoji, entry] of named) {
      emoji.localise(entry);
    }
    // A search typed while the names were loading shows its results in English until now.
    this.#menu.searchItem.refresh();
  }

  #watchSettings(): void {
    const settings = this.#settings;
    settings.onChanged('emojisize', () => {
      this.#menu.setEmojiSize(settings.emojiSize);
    });
    settings.onChanged('always-show', () => {
      this.#menu.refreshVisibility();
    });
    settings.onChanged('use-keybinding', () => {
      this.#syncKeybinding();
    });
    // The number of columns and the position are laid out when the menu is created.
    for (const key of ['nbcols', 'position'] as const) {
      settings.onChanged(key, () => {
        this.#rebuildMenu();
      });
    }
  }

  #newMenu(): EmojiMenu {
    return new EmojiMenu(this.#settings, this.#catalogue, this.#iconDir);
  }

  /** Puts the menu in the panel, or destroys it if the panel refuses it. */
  #addToPanel(menu: EmojiMenu): void {
    try {
      Main.panel.addToStatusArea(this.#uuid, menu.button, 0, 'right');
    } catch (error) {
      menu.destroy();
      throw error;
    }
  }

  /**
   * Replaces the menu with one laid out for the new settings. If the new one cannot be built, the old one
   * stays; if it cannot be put in the panel (the old one is gone by then, since the panel has one place
   * for it), the session ends, which leaves nothing half-working.
   */
  #rebuildMenu(): void {
    let next: EmojiMenu;
    try {
      next = this.#newMenu();
    } catch (error) {
      console.error('Cannot rebuild the menu, keeping the old one', error);
      return;
    }
    this.#menu.destroy();
    try {
      this.#addToPanel(next);
    } catch (error) {
      console.error('Cannot put the rebuilt menu in the panel, stopping', error);
      this.end();
      return;
    }
    this.#menu = next;
  }

  /** The shortcut is bound exactly when the settings say so. */
  #syncKeybinding(): void {
    this.#removeKeybinding();
    if (this.#settings.useKeybinding) {
      const action = Main.wm.addKeybinding(
        KEYBINDING,
        this.#settings.raw,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.ALL,
        () => {
          this.#menu.toggle();
        },
      );
      const refused: number = Meta.KeyBindingAction.NONE;
      if (action === refused) {
        console.error(`Cannot bind the shortcut '${KEYBINDING}' (the Shell refused it)`);
        return;
      }
      this.#keybindingAdded = true;
    }
  }

  #removeKeybinding(): void {
    if (this.#keybindingAdded) {
      Main.wm.removeKeybinding(KEYBINDING);
      this.#keybindingAdded = false;
    }
  }
}
