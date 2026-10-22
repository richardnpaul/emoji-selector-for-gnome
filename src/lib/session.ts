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
    this.#menu = this.#createMenu();
    try {
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
        this.#menu.destroy();
        this.#menu = this.#createMenu();
      });
    }
  }

  #createMenu(): EmojiMenu {
    const menu = new EmojiMenu(this.#settings, this.#catalogue, this.#iconDir);
    try {
      Main.panel.addToStatusArea(this.#uuid, menu.button, 0, 'right');
    } catch (error) {
      menu.destroy();
      throw error;
    }
    return menu;
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
