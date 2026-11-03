// A little French, for the tests: the data of the package has an entry for every emoji of the table, in its order.
import { EMOJIS_CHARACTERS } from '../../../src/data/emojisCharacters.ts';

const FRENCH = {
	'😀': 'visage souriant|sourire|content',
	'🐈': 'chat|félin|animal',
	'☕': 'boisson chaude|caféine|thé',
};

export default EMOJIS_CHARACTERS.flat().map((emoji) => FRENCH[emoji] ?? '');
