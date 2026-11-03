import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Session } from './lib/session.js';
import { EmojiSettings } from './lib/settings.js';

/** A button in the top panel opening a menu to search and copy emojis. */
export default class EmojiSelectorExtension extends Extension {
  #session: Session | null = null;

  override enable(): void {
    this.#session = new Session(new EmojiSettings(this.getSettings()), this.uuid, `${this.path}/icons`, {
      localeNames: GLib.get_language_names(),
      importNameData: (key) => {
        const module = `./data/names/${key}.js`;
        return import(module) as Promise<unknown>;
      },
    });
  }

  override disable(): void {
    this.#session?.end();
    this.#session = null;
  }
}
