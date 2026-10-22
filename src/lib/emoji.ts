// None, woman, man (appended after the emoji, so the sequence ends in a gender sign).
const GENDER_SIGNS = ['', '\u200D\u2640\uFE0F', '\u200D\u2642\uFE0F'];
const PEOPLE = ['👩', '👨'] as const;
const SKIN_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

const TRAILING_GENDER_SIGN = /\u200D[\u2640\u2642]\uFE0F$/;
const SKIN_TONE_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * An emoji of the catalogue: its base character, its keywords (the first is its
 * name) and, derived from the marker keywords, how a skin tone and a gender are
 * applied to it.
 */
export class Emoji {
  readonly baseCharacter: string;
  readonly keywords: readonly string[];
  readonly canHaveTone: boolean;
  readonly canHaveGender: boolean;
  readonly isGendered: boolean;

  constructor(baseCharacter: string, keywords: readonly string[]) {
    this.baseCharacter = baseCharacter;
    this.keywords = keywords;
    this.canHaveTone = keywords.includes('HAS_TONE');
    this.canHaveGender = keywords.includes('HAS_GENDER');
    this.isGendered = keywords.includes('IS_GENDERED');
  }

  get name(): string {
    return this.keywords[0] ?? '';
  }

  /**
   * The emoji with the chosen skin tone and gender applied:
   * - tonable: the skin tone follows the emoji, or the first person of an
   *   already-gendered emoji ([man|woman] + [skin tone] + [other symbols]);
   * - genderable: the gender sign comes last.
   * An emoji that takes neither is returned unmodified.
   */
  tagged(skinTone: number, gender: number): string {
    let emoji = this.baseCharacter;
    if (this.canHaveTone) {
      const tone = SKIN_TONES[skinTone] ?? '';
      if (this.isGendered) {
        for (const person of PEOPLE) {
          if (emoji.includes(person)) {
            emoji = emoji.replace(person, person + tone);
            break;
          }
        }
      } else {
        emoji += tone;
      }
    }
    if (this.canHaveGender) {
      emoji += GENDER_SIGNS[gender] ?? '';
    }
    return emoji;
  }

  /**
   * Whether `emoji` is this one, possibly with the skin tone and gender it was
   * copied with (the opposite of `tagged`). Only the tags this emoji can take
   * are ignored, so a different emoji that happens to end in a gender sign is
   * not mistaken for it.
   */
  isUsedAs(emoji: string): boolean {
    let bare = emoji;
    if (this.canHaveGender) {
      bare = bare.replace(TRAILING_GENDER_SIGN, '');
    }
    if (this.canHaveTone) {
      bare = bare.replace(SKIN_TONE_MODIFIERS, '');
    }
    return bare === this.baseCharacter;
  }
}
