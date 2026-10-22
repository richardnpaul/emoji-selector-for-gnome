// A Gio.Settings fake whose keys, types and defaults come from the extension's real
// gschema.xml. Reading an unknown key, or using the wrong getter/setter for a key's
// type, throws, as GSettings does (it aborts the process). That makes the tests prove
// the code and the schema agree.
import { readFileSync } from 'node:fs';

import { SignalEmitter } from './toolkit.js';

const GETTERS = { s: 'get_string', i: 'get_int', b: 'get_boolean', as: 'get_strv' };
const SETTERS = { s: 'set_string', i: 'set_int', b: 'set_boolean', as: 'set_strv' };

/** Parses the subset of GVariant text syntax the schema uses: s, i, b and as. */
export function parseDefault(type, text) {
	const value = text.trim();
	switch (type) {
		case 's':
			return value.slice(1, -1);
		case 'i':
			return Number.parseInt(value, 10);
		case 'b':
			return value === 'true';
		case 'as':
			return [...value.matchAll(/'([^']*)'/g)].map((m) => m[1]);
		default:
			throw new Error(`Unsupported GVariant type '${type}'`);
	}
}

export function parseSchema(xmlPath) {
	const xml = readFileSync(xmlPath, 'utf8');
	const keys = new Map();
	for (const match of xml.matchAll(/<key\s+([^>]*)>([\s\S]*?)<\/key>/g)) {
		const type = /type="([^"]+)"/.exec(match[1])[1];
		const name = /name="([^"]+)"/.exec(match[1])[1];
		const body = /<default>([\s\S]*?)<\/default>/.exec(match[2])[1];
		const text = body.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
		const range = /<range\s+min="(-?\d+)"\s+max="(-?\d+)"/.exec(match[2]);
		const choices = [...match[2].matchAll(/<choice\s+value="([^"]+)"/g)].map((m) => m[1]);
		keys.set(name, {
			type,
			default: parseDefault(type, text),
			range: range ? { min: Number(range[1]), max: Number(range[2]) } : null,
			choices: choices.length ? choices : null,
		});
	}
	const schemaId = /<schema\s+id="([^"]+)"/.exec(xml)[1];
	return { schemaId, keys };
}

export class FakeSettings extends SignalEmitter {
	#schema;
	#enforce;
	#values = new Map();
	#written = new Set();

	/**
	 * @param {object} schema from parseSchema
	 * @param {{enforce?: boolean}} [options] with `enforce`, a write outside a key's range or choices
	 *   is refused exactly as real GSettings refuses it: it returns false, changes nothing and emits nothing.
	 */
	constructor(schema, { enforce = false } = {}) {
		super();
		this.#enforce = enforce;
		this.#schema = schema;
		this.schemaId = schema.schemaId;
		for (const [name, key] of schema.keys) {
			this.#values.set(name, structuredClone(key.default));
		}
		for (const [type, getter] of Object.entries(GETTERS)) {
			this[getter] = (name) => this.#read(name, type);
		}
		for (const [type, setter] of Object.entries(SETTERS)) {
			this[setter] = (name, value) => this.#write(name, type, value);
		}
	}

	#key(name, type) {
		const key = this.#schema.keys.get(name);
		if (!key) {
			throw new Error(`Settings schema '${this.schemaId}' does not contain a key named '${name}'`);
		}
		if (key.type !== type) {
			throw new Error(`Key '${name}' has type '${key.type}', not '${type}'`);
		}
	}

	#read(name, type) {
		this.#key(name, type);
		return structuredClone(this.#values.get(name));
	}

	#write(name, type, value) {
		this.#key(name, type);
		const valid =
			(type === 's' && typeof value === 'string') ||
			(type === 'i' && Number.isInteger(value)) ||
			(type === 'b' && typeof value === 'boolean') ||
			(type === 'as' && Array.isArray(value) && value.every((v) => typeof v === 'string'));
		if (!valid) {
			throw new TypeError(`Invalid value for '${name}' (${type}): ${JSON.stringify(value)}`);
		}
		const { range, choices } = this.#schema.keys.get(name);
		if (
			this.#enforce &&
			((range && (value < range.min || value > range.max)) || (choices && !choices.includes(value)))
		) {
			return false;
		}
		// Verified against real GSettings (memory backend, see real-tools.tooling.test.js): writing the
		// value a key already holds emits nothing; the first write of a key does, even of its default.
		const changed = !this.#written.has(name) || JSON.stringify(this.#values.get(name)) !== JSON.stringify(value);
		this.#written.add(name);
		this.#values.set(name, structuredClone(value));
		if (changed) {
			this.emit(`changed::${name}`, name);
			this.emit('changed', name);
		}
		return true;
	}

	/**
	 * Gio.Settings.bind (flags DEFAULT): the property shows the setting and writes it when it changes,
	 * until the object is destroyed. Integers go through numbers, as GSettings converts them.
	 */
	bind(name, object, property) {
		const { type } = this.#schema.keys.get(name);
		const show = () => {
			const value = this.#values.get(name);
			if (object[property] !== value) {
				object[property] = value;
			}
		};
		show();
		const handlers = [this.connect(`changed::${name}`, show)];
		const written = object.connect(`notify::${property}`, () => {
			this.#write(name, type, type === 'i' ? Math.round(object[property]) : object[property]);
		});
		object.connect('destroy', () => {
			handlers.forEach((id) => this.disconnect(id));
			object.disconnect(written);
		});
	}

	/** Every key name and type, for tests that cross-check the schema against the code. */
	keys() {
		return [...this.#schema.keys].map(([name, key]) => ({ name, type: key.type }));
	}
}
