import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Session } from './lib/session.js';
import { EmojiSettings } from './lib/settings.js';

/** A button in the top panel opening a menu to search and copy emojis. */
export default class EmojiSelectorExtension extends Extension {
  #session: Session | null = null;

  override enable(): void {
    this.#session = new Session(new EmojiSettings(this.getSettings()), this.uuid, `${this.path}/icons`);
  }

  override disable(): void {
    this.#session?.end();
    this.#session = null;
  }
}
