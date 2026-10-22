import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { EmojiSettings } from './settings.js';

/**
 * The row of buttons choosing the skin tone (and, for some categories, the gender) applied to the
 * emoji that support them. The choice is stored in the settings.
 */
export class SkinTonesBar {
  /** One button per skin tone, in the order of the `skin-tone` setting (0 = no skin tone). */
  readonly tones: St.Button[];
  /** The women and men buttons (values 1 and 2 of the `gender` setting), or none. */
  readonly genders: St.Button[];
  readonly #settings: EmojiSettings;

  constructor(settings: EmojiSettings, hasGender: boolean) {
    this.#settings = settings;
    const tones: [string, string][] = [
      [_('No skin tone'), '#FFEE00'],
      [_('Light skin tone'), '#FFD8A8'],
      [_('Medium light skin tone'), '#E5B590'],
      [_('Medium skin tone'), '#B88750'],
      [_('Medium dark skin tone'), '#9B6020'],
      [_('Dark skin tone'), '#4B2000'],
    ];
    this.tones = tones.map(([name, colour], tone) => this.#toneButton(name, colour, tone));
    this.genders = hasGender ? [this.#genderButton(1, _('Women'), '♀'), this.#genderButton(2, _('Men'), '♂')] : [];
    this.update();
  }

  /** Adds the buttons to a container, genders first. */
  addTo(parent: St.Widget): void {
    [...this.genders, ...this.tones].forEach((button) => {
      parent.add_child(button);
    });
  }

  /** Makes the buttons reflect the current settings. */
  update(): void {
    this.#uncheckTones();
    this.tones[this.#settings.skinTone]?.set_checked(true);
    this.#showGender(this.#settings.gender);
  }

  #toneButton(accessibleName: string, colour: string, tone: number): St.Button {
    const button = new St.Button({
      reactive: true,
      can_focus: true,
      track_hover: true,
      toggle_mode: true,
      accessible_name: accessibleName,
      style_class: 'EmojisTone',
      style: `background-color: ${colour};`,
    });
    button.connect('clicked', () => {
      this.#uncheckTones();
      button.set_checked(true);
      this.#settings.skinTone = tone;
    });
    return button;
  }

  #genderButton(gender: number, accessibleName: string, label: string): St.Button {
    const button = new St.Button({
      reactive: true,
      can_focus: true,
      track_hover: true,
      toggle_mode: true,
      accessible_name: accessibleName,
      style_class: 'EmojisGender',
      label,
    });
    button.connect('clicked', () => {
      // Clicking the selected gender again clears it.
      this.#settings.gender = this.#settings.gender === gender ? 0 : gender;
      this.#showGender(this.#settings.gender);
    });
    return button;
  }

  #uncheckTones(): void {
    this.tones.forEach((button) => {
      button.set_checked(false);
    });
  }

  #showGender(gender: number): void {
    this.genders.forEach((button, index) => {
      button.set_checked(gender === index + 1);
    });
  }
}
