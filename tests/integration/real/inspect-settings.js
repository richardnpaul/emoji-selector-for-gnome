// Run with: gjs -m tests/integration/real/inspect-settings.js <schema dir> '<json array of probes>'
// Applies each probe ["set_int"|"set_string"|..., key, value] to the REAL Gio.Settings (in-memory
// backend) for the compiled schema in <schema dir> and prints, for each, the call's result and the
// key's value afterwards, so a test can check that the fake Gio.Settings behaves identically.
import Gio from 'gi://Gio';
import { programArgs } from 'system';

const [schemaDir, probes] = programArgs;
const source = Gio.SettingsSchemaSource.new_from_directory(schemaDir, null, false);
const settings = new Gio.Settings({
	settings_schema: source.lookup('org.gnome.shell.extensions.emoji-selector', false),
});
const getters = { set_int: 'get_int', set_string: 'get_string', set_boolean: 'get_boolean', set_strv: 'get_strv' };

const results = JSON.parse(probes).map(([method, key, value]) => {
	let emitted = 0;
	const id = settings.connect(`changed::${key}`, () => emitted++);
	const result = settings[method](key, value);
	settings.disconnect(id);
	return { method, key, value, result, after: settings[getters[method]](key), emitted: emitted > 0 };
});
print(JSON.stringify(results));
