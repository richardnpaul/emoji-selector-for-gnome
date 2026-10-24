import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { EMOJIS_CHARACTERS } from '../data/emojisCharacters.js';
import { EMOJIS_KEYWORDS } from '../data/emojisKeywords.js';
import { buildCatalogue } from './catalogue.js';
import type { Emoji } from './emoji.js';
import { EmojiMenu } from './emojiMenu.js';
import type { EmojiSettings } from './settings.js';

const KEYBINDING = 'emoji-keybinding';

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

  constructor(settings: EmojiSettings, uuid: string, iconDir: string) {
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
  }

  end(): void {
    this.#removeKeybinding();
    this.#settings.disconnectAll();
    this.#menu.destroy();
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
