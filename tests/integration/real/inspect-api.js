// Run with: gjs -m tests/integration/real/inspect-api.js '<json array of dotted paths>'
// Resolves each path (e.g. "Clutter.ModifierType.SHIFT_MASK") against the REAL Clutter, St, Meta,
// Shell and GLib libraries and prints its type and, for primitives, its value. Used to check that
// every API name the extension uses exists, and that the unit-test fakes use the real values.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { programArgs } from 'system';

const libraries = { Clutter, GLib, Meta, Shell, St };
const result = {};
for (const path of JSON.parse(programArgs[0])) {
	let node = libraries;
	for (const part of path.split('.')) {
		node = node?.[part];
	}
	const type = node === undefined ? 'undefined' : typeof node;
	result[path] = type === 'function' || type === 'object' ? { type } : { type, value: node };
}
print(JSON.stringify(result));
