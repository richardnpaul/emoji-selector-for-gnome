import type Gio from 'gi://Gio';

/** Every key of the extension's GSettings schema. */
export type SettingKey =
  | 'position'
  | 'nbcols'
  | 'emojisize'
  | 'recently-used'
  | 'use-keybinding'
  | 'always-show'
  | 'skin-tone'
  | 'gender'
  | 'emoji-keybinding';

export type MenuPosition = 'top' | 'bottom';

/**
 * The extension's settings, typed. Value limits (the number of columns, the skin tone, ...) are declared
 * in the schema, so GSettings itself refuses invalid writes and ignores invalid stored values.
 */
export class EmojiSettings {
  readonly #settings: Gio.Settings;
  #handlers: number[] = [];

  constructor(settings: Gio.Settings) {
    this.#settings = settings;
  }

  /** The underlying settings, which the Shell needs to bind a key. */
  get raw(): Gio.Settings {
    return this.#settings;
  }

  get position(): MenuPosition {
    return this.#settings.get_string('position') === 'bottom' ? 'bottom' : 'top';
  }

  get columns(): number {
    return this.#settings.get_int('nbcols');
  }

  get emojiSize(): number {
    return this.#settings.get_int('emojisize');
  }

  get skinTone(): number {
    return this.#settings.get_int('skin-tone');
  }

  set skinTone(tone: number) {
    this.#settings.set_int('skin-tone', tone);
  }

  get gender(): number {
    return this.#settings.get_int('gender');
  }

  set gender(gender: number) {
    this.#settings.set_int('gender', gender);
  }

  get alwaysShow(): boolean {
    return this.#settings.get_boolean('always-show');
  }

  get useKeybinding(): boolean {
    return this.#settings.get_boolean('use-keybinding');
  }

  get recentlyUsed(): string[] {
    return this.#settings.get_strv('recently-used');
  }

  set recentlyUsed(emojis: string[]) {
    this.#settings.set_strv('recently-used', emojis);
  }

  /** Calls `callback` whenever `key` changes. All such handlers are removed by disconnectAll(). */
  onChanged(key: SettingKey, callback: () => void): void {
    this.#handlers.push(this.#settings.connect(`changed::${key}`, callback));
  }

  disconnectAll(): void {
    this.#handlers.forEach((id) => {
      this.#settings.disconnect(id);
    });
    this.#handlers = [];
  }
}
