import type Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { EmojiButton, type EmojiContext } from './emojiButton.js';
import type { SearchPriority } from './emojiCategory.js';

/** What the search needs from a category. */
export interface SearchableCategory {
  search(
    text: string,
    found: readonly string[],
    recentlyUsed: readonly string[],
    needed: number,
    priority: SearchPriority,
  ): string[];
}

/** Which categories a search looks into: all of them, or only the one that is open. */
export interface SearchScope {
  categoriesToSearch(): readonly SearchableCategory[];
}

// From the most important criterion to very general string matching: the recently used emojis
// matching the text, an exact match with an emoji name, a match in the names, a match in any keyword.
const SEARCH_PRIORITIES: readonly SearchPriority[] = ['recent', 'exact-name', 'name', 'keyword'];

/**
 * The search entry, and under it a row of buttons which shows the recently used emojis, or the
 * results of the search when the entry is not empty.
 */
export class EmojiSearchItem {
  readonly entry: St.Entry;
  /** The menu item holding the search entry. */
  readonly searchItem: PopupMenu.PopupBaseMenuItem;
  /** The menu item holding the row of buttons. */
  readonly recentsItem: PopupMenu.PopupBaseMenuItem;
  readonly recents: EmojiButton[];
  readonly #context: EmojiContext;
  readonly #scope: SearchScope;

  constructor(context: EmojiContext, scope: SearchScope, columns: number) {
    this.#context = context;
    this.#scope = scope;

    this.searchItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    this.entry = new St.Entry({
      name: 'searchEntry',
      style_class: 'search-entry',
      can_focus: true,
      hint_text: _('Type here to search…'),
      track_hover: true,
      x_expand: true,
    });
    this.searchItem.add_child(this.entry);
    this.entry.get_clutter_text().connect('text-changed', () => {
      this.refresh();
    });
    // Pressing Enter when no emoji is focused activates the first one.
    this.entry.get_clutter_text().connect('key-press-event', (_text: unknown, event: Clutter.Event) => {
      return this.recents[0]?.onKeyPress(event) ?? false;
    });

    this.recentsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    const container = new St.BoxLayout();
    this.recentsItem.add_child(container);
    this.recents = Array.from({ length: columns }, () => {
      const button = new EmojiButton(context, null);
      button.setSize(context.settings.emojiSize);
      container.add_child(button.actor);
      return button;
    });
    this.refresh();
  }

  /** Shows the recently used emojis if the entry is empty, and otherwise the results of the search. */
  refresh(): void {
    const text = this.entry.get_text().toLowerCase();
    // (Slots left over, when there are fewer emojis than slots, stay blank.)
    this.#show(text === '' ? this.#recentlyUsed() : this.#search(text));
  }

  /** Makes `emoji` the most recently used one. */
  recordUse(emoji: string): void {
    if (emoji === '') {
      return;
    }
    const others = this.#recentlyUsed().filter((used) => used !== emoji);
    this.#context.settings.recentlyUsed = [emoji, ...others].slice(0, this.recents.length);
    this.refresh();
  }

  setEmojiSize(size: number): void {
    this.recents.forEach((button) => {
      button.setSize(size);
    });
  }

  /** Empties the entry, which shows the recently used emojis again. */
  clear(): void {
    this.entry.set_text('');
  }

  #recentlyUsed(): string[] {
    return this.#context.settings.recentlyUsed;
  }

  #search(text: string): string[] {
    const recentlyUsed = this.#recentlyUsed();
    const categories = this.#scope.categoriesToSearch();
    let results: string[] = [];
    for (const priority of SEARCH_PRIORITIES) {
      for (const category of categories) {
        const slots = this.recents.length - results.length;
        if (slots > 0) {
          results = results.concat(category.search(text, results, recentlyUsed, slots, priority));
        }
      }
    }
    return results;
  }

  /** Labels the buttons, leaving the ones without an emoji blank and out of the focus chain. */
  #show(emojis: readonly string[]): void {
    this.recents.forEach((button, i) => {
      const emoji = emojis[i] ?? '';
      button.actor.label = emoji;
      button.actor.can_focus = emoji !== '';
      button.actor.track_hover = emoji !== '';
    });
  }
}
