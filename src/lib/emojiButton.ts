import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type { Emoji } from './emoji.js';
import type { EmojiSettings } from './settings.js';

/**
 * What happens to the clipboard (and the menu) when an emoji is picked:
 * - `replace-and-close`: the emoji replaces the clipboard content, and the menu closes;
 * - `replace`: the same, but the menu stays open;
 * - `append`: the emoji is added at the end of the clipboard content, and the menu stays open.
 */
export type CopyMode = 'replace-and-close' | 'replace' | 'append';

/** What a button needs from the rest of the extension. */
export interface EmojiContext {
  readonly settings: EmojiSettings;
  /** Puts the emoji in the clipboard, and remembers it as the most recently used. */
  copy(emoji: string, mode: CopyMode): void;
}

/** The style of the emoji buttons for a font size in pixels. */
export function emojiStyle(size: number): string {
  return `font-size: ${size}px; color: #FFFFFF;`;
}

/**
 * A button showing one emoji. A button without an `Emoji` is a slot whose label is set by the
 * caller (the recently used row), and is copied as it is.
 */
export class EmojiButton {
  readonly actor: St.Button;
  readonly #context: EmojiContext;
  readonly #emoji: Emoji | null;

  /** `onHover` is told the name of the emoji when the pointer enters, and `null` when it leaves. */
  constructor(context: EmojiContext, emoji: Emoji | null, onHover?: (name: string | null) => void) {
    this.#context = context;
    this.#emoji = emoji;
    this.actor = new St.Button({
      style_class: 'EmojisItemStyle',
      can_focus: true,
      label: emoji?.baseCharacter ?? '',
    });
    this.actor.connect('button-press-event', (_actor: St.Button, event: Clutter.Event) => this.onButtonPress(event));
    this.actor.connect('key-press-event', (_actor: St.Button, event: Clutter.Event) => this.onKeyPress(event));
    if (onHover && emoji) {
      this.actor.connect('notify::hover', () => {
        onHover(this.actor.hover ? emoji.displayName : null);
      });
    }
  }

  setSize(size: number): void {
    this.actor.style = emojiStyle(size);
  }

  /**
   * Left click replaces the clipboard content and closes the menu; middle click
   * does the same without closing the menu; right click adds the emoji after the
   * current clipboard content (and does not close the menu).
   */
  onButtonPress(event: Clutter.Event): boolean {
    const mode = ((): CopyMode | null => {
      switch (event.get_button()) {
        case 1:
          return 'replace-and-close';
        case 2:
          return 'replace';
        case 3:
          return 'append';
        default:
          return null;
      }
    })();
    return mode === null ? Clutter.EVENT_PROPAGATE : this.#copy(mode);
  }

  /** Enter copies and closes the menu; with Ctrl it stays open, with Shift it also appends. */
  onKeyPress(event: Clutter.Event): boolean {
    const symbol = event.get_key_symbol();
    if (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_KP_Enter) {
      return Clutter.EVENT_PROPAGATE;
    }
    const state = event.get_state();
    if ((state & Clutter.ModifierType.SHIFT_MASK) !== 0) {
      return this.#copy('append');
    }
    if ((state & Clutter.ModifierType.CONTROL_MASK) !== 0) {
      return this.#copy('replace');
    }
    return this.#copy('replace-and-close');
  }

  #copy(mode: CopyMode): boolean {
    const label = this.actor.label;
    if (label === '') {
      return Clutter.EVENT_PROPAGATE;
    }
    const settings = this.#context.settings;
    this.#context.copy(this.#emoji ? this.#emoji.tagged(settings.skinTone, settings.gender) : label, mode);
    return Clutter.EVENT_STOP;
  }
}
