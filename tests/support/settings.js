import { EmojiSettings } from '../../src/lib/settings.ts';
import { EXTENSION_DIR, METADATA } from './paths.js';
import { FakeSettings, parseSchema } from './fakes/settings.js';

const SCHEMA = parseSchema(`${EXTENSION_DIR}/schemas/${METADATA['settings-schema']}.gschema.xml`);

/**
 * Fresh settings backed by the real schema, enforcing its ranges as GSettings does (`enforce: false` lets
 * a test store a value that the schema forbids, to see what the code does with a stored value it dislikes).
 */
export function createSettings({ enforce = true } = {}) {
	const raw = new FakeSettings(SCHEMA, { enforce });
	return { raw, settings: new EmojiSettings(raw) };
}
