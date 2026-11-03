import { fold } from './fold.js';

// None, woman, man (appended after the emoji, so the sequence ends in a gender sign).
const GENDER_SIGNS = ['', '\u200D\u2640\uFE0F', '\u200D\u2642\uFE0F'];
const PEOPLE = ['👩', '👨'] as const;
const SKIN_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

const TAG_MARKERS = ['HAS_TONE', 'HAS_GENDER', 'IS_GENDERED'];

const TRAILING_GENDER_SIGN = /\u200D[\u2640\u2642]\uFE0F$/;
const SKIN_TONE_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * An emoji of the catalogue: its base character, its keywords (the first is its
 * name) and, derived from the marker keywords, how a skin tone and a gender are
 * applied to it. It can also be given its name and keywords in the language of the
 * user, which the search finds as well as the English ones.
 */
export class Emoji {
  readonly baseCharacter: string;
  readonly keywords: readonly string[];
  readonly canHaveTone: boolean;
  readonly canHaveGender: boolean;
  readonly isGendered: boolean;
  /** The name and keywords, in English, folded for comparison; the markers of the tags are no words. */
  readonly #words: readonly string[];
  #localName: string | null = null;
  #localWords: readonly string[] = [];

  constructor(baseCharacter: string, keywords: readonly string[]) {
    this.baseCharacter = baseCharacter;
    this.keywords = keywords;
    this.canHaveTone = keywords.includes('HAS_TONE');
    this.canHaveGender = keywords.includes('HAS_GENDER');
    this.isGendered = keywords.includes('IS_GENDERED');
    this.#words = keywords.filter((keyword) => !TAG_MARKERS.includes(keyword)).map(fold);
  }

  get name(): string {
    return this.keywords[0] ?? '';
  }

  /** The name to show: in the language of the user if there is one, and otherwise in English. */
  get displayName(): string {
    return this.#localName ?? this.name;
  }

  /**
   * Gives the name and the keywords in the language of the user, as `name|keyword|keyword`; an empty
   * entry (no translation) leaves the emoji with its English ones. Replaces an earlier entry.
   */
  localise(entry: string): void {
    const words = entry.split('|').filter((word) => word !== '');
    this.#localName = words[0] ?? null;
    this.#localWords = words.map(fold);
  }

  /** Whether the name, in English or in the user's language, is exactly `text` (which is folded). */
  isNamed(text: string): boolean {
    return this.#names().some((name) => name === text);
  }

  /** Whether the name, in English or in the user's language, contains `text` (which is folded). */
  nameHas(text: string): boolean {
    return this.#names().some((name) => name.includes(text));
  }

  /** Whether any keyword (the name is the first), in English or in the user's language, contains `text` (which is folded). */
  hasKeyword(text: string): boolean {
    return [...this.#words, ...this.#localWords].some((word) => word.includes(text));
  }

  #names(): string[] {
    return [this.#words[0], this.#localWords[0]].filter((name) => name !== undefined);
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
