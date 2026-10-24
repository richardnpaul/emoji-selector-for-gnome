const COMBINING_ACCENTS = /[\u0300-\u036F]/g;
const SPACES = /\p{Zs}/gu;

/**
 * The text as the search compares it: in lower case, with plain spaces and without accents, so that `cafe`
 * finds `café` and `drapeau : france` finds `drapeau\u202F: France` (French keeps the colon off the line
 * break with a narrow no-break space). Only the accents of Latin, Greek and Cyrillic letters go (the marks
 * of other scripts, such as the vowel signs of Hindi, are part of the letters).
 */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_ACCENTS, '').replace(SPACES, ' ');
}
