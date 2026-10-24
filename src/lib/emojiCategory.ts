import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type { Emoji } from './emoji.js';
import { EmojiButton, type EmojiContext } from './emojiButton.js';
import { SkinTonesBar } from './skinTonesBar.js';

/** What a category needs from the menu that holds it. */
export interface CategoryHost {
  /** Closes every category, and resets the search to all of them. */
  clearCategories(): void;
  /** A category was shown, so the search should now look in that one only. */
  categoryOpened(id: number): void;
}

export interface CategoryDefinition {
  readonly id: number;
  readonly name: string;
  readonly icon: Gio.Icon;
  readonly emojis: readonly Emoji[];
  /** The skin tone picker of the category, with the gender picker too if asked; null for none. */
  readonly picker: 'tones' | 'tones-and-genders' | null;
}

/**
 * How strictly an emoji must match the search text: `recent` = any match, but only among the recently
 * used emojis; `exact-name` = the name is the text; `name` = the name contains the text; `keyword` = any
 * keyword contains the text.
 */
export type SearchPriority = 'recent' | 'exact-name' | 'name' | 'keyword';

/**
 * A submenu item shows an arrow, which a category (opened by its own button) does not want. It is
 * not part of the item's public interface, so a Shell that renames it just keeps the arrow.
 */
export function hideSubmenuArrow(item: object): void {
  const arrow = (item as { _triangleBin?: St.Widget })._triangleBin;
  if (arrow) {
    arrow.visible = false;
  }
}

/**
 * A category of emoji: a button in the menu's header, and a submenu item that shows the emoji of the
 * category when its button is toggled. The emoji buttons are only created when the category is first
 * opened, because thousands of buttons would cost memory for nothing.
 */
export class EmojiCategory {
  readonly id: number;
  readonly name: string;
  readonly item: PopupMenu.PopupSubMenuMenuItem;
  readonly button: St.Button;
  readonly #context: EmojiContext;
  readonly #host: CategoryHost;
  readonly #emojis: readonly Emoji[];
  readonly #skinTonesBar: SkinTonesBar | null;
  readonly #columns: number;
  #built = false;
  #emojiButtons: EmojiButton[] = [];

  constructor(context: EmojiContext, host: CategoryHost, definition: CategoryDefinition, columns: number) {
    this.#context = context;
    this.#host = host;
    this.id = definition.id;
    this.name = definition.name;
    this.#emojis = definition.emojis;
    this.#columns = columns;

    this.item = new PopupMenu.PopupSubMenuMenuItem(definition.name);
    this.item.visible = false;
    this.item.reactive = false;
    hideSubmenuArrow(this.item);

    this.#skinTonesBar = definition.picker
      ? new SkinTonesBar(context.settings, definition.picker === 'tones-and-genders')
      : null;
    this.#skinTonesBar?.addTo(this.item);

    this.button = new St.Button({
      reactive: true,
      can_focus: true,
      track_hover: true,
      toggle_mode: true,
      accessible_name: definition.name,
      style_class: 'EmojisCategory',
      child: new St.Icon({ gicon: definition.icon, icon_size: 16 }),
      x_expand: true,
      x_align: Clutter.ActorAlign.CENTER,
    });
    this.button.connect('clicked', () => {
      this.#toggle();
    });
  }

  setEmojiSize(size: number): void {
    this.#emojiButtons.forEach((emojiButton) => {
      emojiButton.setSize(size);
    });
  }

  /**
   * The base characters of the emojis of this category matching `text` (folded, see `fold`), at most
   * `needed` of them, leaving out those already in `found`.
   */
  search(
    text: string,
    found: readonly string[],
    recentlyUsed: readonly string[],
    needed: number,
    priority: SearchPriority,
  ): string[] {
    const results: string[] = [];
    for (const emoji of this.#emojis) {
      if (results.length >= needed) {
        break;
      }
      if (!found.includes(emoji.baseCharacter) && this.#matches(emoji, text, recentlyUsed, priority)) {
        results.push(emoji.baseCharacter);
      }
    }
    return results;
  }

  /** Creates the emoji buttons, in rows, the first time it is called. */
  build(): void {
    if (this.#built) {
      return;
    }
    const size = this.#context.settings.emojiSize;
    const rowCount = Math.ceil(this.#emojis.length / this.#columns);
    Array.from({ length: rowCount }, (_row, rowIndex) => rowIndex).forEach((rowIndex) => {
      const row = new PopupMenu.PopupBaseMenuItem({
        style_class: 'EmojisList',
        reactive: false,
        can_focus: false,
      });
      row.track_hover = false;
      const container = new St.BoxLayout();
      row.add_child(container);
      this.item.menu.addMenuItem(row);
      for (const emoji of this.#emojis.slice(rowIndex * this.#columns, (rowIndex + 1) * this.#columns)) {
        const emojiButton = new EmojiButton(this.#context, emoji, (name) => {
          this.item.label.text = name ?? this.name;
        });
        emojiButton.setSize(size);
        this.#emojiButtons.push(emojiButton);
        container.add_child(emojiButton.actor);
      }
    });
    this.#built = true;
  }

  /** Shows the emoji of the category, after closing the others. */
  open(): void {
    this.#host.clearCategories();
    this.item.label.text = this.name;
    this.build();
    this.#skinTonesBar?.update();
    this.button.set_checked(true);
    this.item.visible = true;
    this.item.setSubmenuShown(true);
    this.#host.categoryOpened(this.id);
  }

  close(): void {
    this.button.set_checked(false);
    this.item.setSubmenuShown(false);
    this.item.visible = false;
  }

  #toggle(): void {
    if (this.item.menu.isOpen) {
      this.#host.clearCategories();
    } else {
      this.open();
    }
  }

  #matches(emoji: Emoji, text: string, recentlyUsed: readonly string[], priority: SearchPriority): boolean {
    switch (priority) {
      case 'recent':
        return emoji.hasKeyword(text) && recentlyUsed.some((used) => emoji.isUsedAs(used));
      case 'exact-name':
        return emoji.isNamed(text);
      case 'name':
        return emoji.nameHas(text);
      case 'keyword':
        return emoji.hasKeyword(text);
    }
  }
}
