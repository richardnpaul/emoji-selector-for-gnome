// Runs shexli (the extensions.gnome.org review linter) and turns its report into a pass/fail.
//
// shexli exits 0 even when it reports warnings, so its exit status cannot be the gate: the
// gate is "no findings at all" (0 errors and 0 warnings), read from its JSON report.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ACCEPTED_FINDINGS } from './shexli-accepted.mjs';

const SEVERITY_ORDER = ['error', 'warning'];
const NOT_A_REPORT = { ok: false, lines: ['shexli: unexpected output (not a report)'] };

const rank = (severity) => {
	const index = SEVERITY_ORDER.indexOf(severity);
	return index === -1 ? SEVERITY_ORDER.length : index;
};
const isFinding = (f) => ['rule_id', 'severity', 'title'].every((key) => typeof f?.[key] === 'string');
const plural = (count) => `${count} finding${count === 1 ? '' : 's'}`;

/** Whether `entry` accepts `finding`: the same rule, and exactly this evidence (so a change shows up again). */
const accepts = (entry, finding) =>
	entry.rule_id === finding.rule_id &&
	Array.isArray(finding.evidence) &&
	finding.evidence.length > 0 &&
	finding.evidence.every((evidence) => evidence?.snippet === entry.snippet);

/**
 * @param {unknown} report the parsed output of `shexli --format json`
 * @param {{rule_id: string, snippet: string, reason: string}[]} [accepted] findings that were reviewed
 *   and are fine; an entry that matches nothing is reported, so that the list cannot rot
 * @returns {{ok: boolean, lines: string[]}}
 */
export function evaluate(report, accepted = []) {
	const findings = report?.findings;
	const reported = report?.summary?.finding_count;
	if (!Array.isArray(findings) || !findings.every(isFinding) || typeof reported !== 'number') {
		return NOT_A_REPORT;
	}
	const unused = [...accepted];
	const problems = findings.filter((finding) => {
		const index = unused.findIndex((entry) => accepts(entry, finding));
		if (index === -1) {
			return true;
		}
		unused.splice(index, 1);
		return false;
	});
	const used = accepted.filter((entry) => !unused.includes(entry));
	const count = problems.length + Math.max(0, reported - findings.length);
	const listed = problems
		.sort((a, b) => rank(a.severity) - rank(b.severity) || a.rule_id.localeCompare(b.rule_id))
		.map((f) => `${f.severity} ${f.rule_id}: ${f.title}`);
	return {
		ok: count === 0 && unused.length === 0,
		lines: [
			count === 0 ? 'shexli: no findings' : `shexli: ${plural(count)}`,
			...listed,
			...used.map((entry) => `accepted ${entry.rule_id} (${entry.snippet}): ${entry.reason}`),
			...unused.map((entry) => `stale: accepted ${entry.rule_id} (${entry.snippet}) was not reported, remove it`),
		],
	};
}

const defaultDependencies = () => ({
	cwd: process.cwd(),
	accepted: ACCEPTED_FINDINGS,
	run: (command, args) => spawnSync(command, args, { encoding: 'utf8' }),
	stdout: (line) => console.log(line),
	stderr: (line) => console.error(line),
});

/**
 * @param {string[]} args the extension zip or directory to check
 * @param {object} [dependencies] replaced in tests
 * @param {string} dependencies.cwd what a relative path is relative to
 * @param {{rule_id: string, snippet: string, reason: string}[]} dependencies.accepted the findings that were reviewed
 * @param {(command: string, args: string[]) => {error?: Error, status: number|null, stdout: string, stderr: string}} dependencies.run runs shexli
 * @param {(line: string) => void} dependencies.stdout prints a result line
 * @param {(line: string) => void} dependencies.stderr prints a problem
 * @returns {number} the process exit code: 0 clean, 1 findings or failure, 2 bad usage
 */
export function main(args, { cwd, accepted, run, stdout, stderr } = defaultDependencies()) {
	if (args.length !== 1) {
		stderr('Usage: check-shexli <extension zip or directory>');
		return 2;
	}
	// shexli 0.2.1 crashes on a relative path to a directory.
	const result = run('shexli', ['--format', 'json', path.resolve(cwd, args[0])]);
	if (result.error) {
		stderr(`Could not run shexli: ${result.error.message}`);
		return 1;
	}
	if (result.status !== 0) {
		stderr(`shexli failed (exit status ${result.status}):`);
		stderr(result.stderr);
		return 1;
	}
	let report;
	try {
		report = JSON.parse(result.stdout);
	} catch {
		stderr('shexli: its output is not valid JSON');
		return 1;
	}
	const { ok, lines } = evaluate(report, accepted);
	lines.forEach((line) => stdout(line));
	return ok ? 0 : 1;
}
