// A small reader for gettext catalogues (.po), for the tests that check them. It reads what `msgcat --no-wrap`
// prints, so continuation lines, escapes and obsolete entries are already normalised by gettext itself.
import { spawnSync } from 'node:child_process';

const unescape = (text) => text.replace(/\\(["\\nt])/g, (_all, c) => ({ n: '\n', t: '\t' })[c] ?? c);

/**
 * @param {string} file path of a .po file
 * @returns {{ header: Record<string, string>, entries: {msgid: string, msgstr: string, fuzzy: boolean}[] }}
 */
export function readCatalogue(file) {
	const result = spawnSync('msgcat', ['--no-wrap', '--no-location', file], { encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(`msgcat ${file} failed:\n${result.stderr}`);
	}
	const header = {};
	const entries = [];
	for (const block of result.stdout.split(/\n\n+/)) {
		const fields = { msgid: '', msgstr: '' };
		let current = null;
		for (const line of block.split('\n')) {
			const keyword = /^(msgid|msgstr) "(.*)"$/.exec(line);
			if (keyword) {
				current = keyword[1];
				fields[current] += keyword[2];
			} else if (current && /^".*"$/.test(line)) {
				fields[current] += line.slice(1, -1); // a continuation line
			} else {
				current = null;
			}
		}
		if (!/^msgid /m.test(block)) {
			continue;
		}
		const msgid = unescape(fields.msgid);
		const msgstr = unescape(fields.msgstr);
		if (msgid === '') {
			for (const line of msgstr.split('\n')) {
				const colon = line.indexOf(':');
				if (colon > 0) {
					header[line.slice(0, colon)] = line.slice(colon + 1).trim();
				}
			}
			continue;
		}
		entries.push({ msgid, msgstr, fuzzy: /^#,.*\bfuzzy\b/m.test(block) });
	}
	return { header, entries };
}

/** The printf-style placeholders of a message, in a comparable form (`%s`, `%1$d`, ...). */
export const placeholders = (text) => (text.match(/%(?:\d+\$)?[sdif]/g) ?? []).sort();
