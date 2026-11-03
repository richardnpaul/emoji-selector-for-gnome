import St from 'gi://St';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

/** The Ctrl+V clipboard (never the middle-click selection). */
export class Clipboard {
  readonly #clipboard = St.Clipboard.get_default();

  replace(text: string): void {
    this.#clipboard.set_text(CLIPBOARD_TYPE, text);
  }

  /** Adds `text` after the current content, which the clipboard hands over asynchronously. */
  append(text: string): void {
    this.#clipboard.get_text(CLIPBOARD_TYPE, (_clipboard, current: string | null) => {
      this.#clipboard.set_text(CLIPBOARD_TYPE, (current ?? '') + text);
    });
  }
}
