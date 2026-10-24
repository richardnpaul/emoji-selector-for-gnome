import { Emoji } from './emoji.js';

/** Pairs each item of `first` with the item of `second` at the same place, which must exist. */
export function pairUp<A, B>(first: readonly A[], second: readonly B[], mismatch: () => Error): [A, B][] {
  const rest = second.values();
  const pairs = first.map((item): [A, B] => {
    const next = rest.next();
    if (next.done) {
      throw mismatch();
    }
    return [item, next.value];
  });
  if (!rest.next().done) {
    throw mismatch();
  }
  return pairs;
}

/**
 * The emojis of every category, from the table of characters and the table of keywords (which list,
 * for each character in the same order, its name, its keywords and its tag markers).
 */
export function buildCatalogue(
  characters: readonly (readonly string[])[],
  keywords: readonly (readonly (readonly string[])[])[],
): Emoji[][] {
  const categories = pairUp(characters, keywords, () => {
    return new Error(`${characters.length} categories of emojis but ${keywords.length} of keywords`);
  });
  return categories.map(([category, words], id) => {
    const emojis = pairUp(category, words, () => {
      return new Error(`Category ${id} has ${category.length} emojis but ${words.length} keyword groups`);
    });
    return emojis.map(([character, keywordGroup]) => new Emoji(character, keywordGroup));
  });
}
