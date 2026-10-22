import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluate, main } from '../../scripts/lib/shexli.mjs';

const report = (findings) => ({
	summary: { finding_count: findings.length, status: findings.length ? 'issues_found' : 'ok' },
	findings,
});
const finding = (rule_id, severity, title) => ({ rule_id, severity, title, message: `${title} details` });

describe('evaluate', () => {
	it('passes a report without findings', () => {
		expect(evaluate(report([]))).toEqual({ ok: true, lines: ['shexli: no findings'] });
	});

	it('fails on a warning, which shexli itself does not treat as a failure', () => {
		const result = evaluate(report([finding('EGO-L-002', 'warning', 'Objects are not destroyed')]));
		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(['shexli: 1 finding', 'warning EGO-L-002: Objects are not destroyed']);
	});

	it('fails on an error, and lists everything it found, most severe first', () => {
		const result = evaluate(
			report([
				finding('EGO-L-003', 'warning', 'Signals not disconnected'),
				finding('EGO-X-001', 'error', 'Forbidden import'),
				finding('EGO-I-001', 'info', 'Worth knowing'),
				finding('EGO-L-002', 'warning', 'Objects are not destroyed'),
			]),
		);
		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([
			'shexli: 4 findings',
			'error EGO-X-001: Forbidden import',
			'warning EGO-L-002: Objects are not destroyed',
			'warning EGO-L-003: Signals not disconnected',
			'info EGO-I-001: Worth knowing',
		]);
	});

	it('trusts the findings, not the summary, when they disagree', () => {
		const lying = { summary: { finding_count: 0 }, findings: [finding('EGO-L-002', 'warning', 'x')] };
		expect(evaluate(lying).ok).toBe(false);
		const alsoLying = { summary: { finding_count: 2 }, findings: [] };
		expect(evaluate(alsoLying)).toEqual({ ok: false, lines: ['shexli: 2 findings'] });
	});

	it.each([
		[{ summary: { finding_count: 1 }, findings: [null] }],
		[{ summary: { finding_count: 1 }, findings: ['text'] }],
		[{ summary: { finding_count: 1 }, findings: [{ severity: 'error', title: 'no rule id' }] }],
		[{ summary: { finding_count: 1 }, findings: [{ rule_id: 'EGO-X-001', title: 'no severity' }] }],
		[{ summary: { finding_count: 1 }, findings: [{ rule_id: 'EGO-X-001', severity: 'error' }] }],
		[null],
		[undefined],
		[42],
		['text'],
		[{}],
		[{ findings: [] }],
		[{ summary: {} }],
		[{ summary: { finding_count: 0 }, findings: 'none' }],
	])('rejects output that is not a shexli report: %j', (output) => {
		const result = evaluate(output);
		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(['shexli: unexpected output (not a report)']);
	});
});

describe('accepted findings', () => {
	const withEvidence = (rule_id, severity, snippets) => ({
		...finding(rule_id, severity, `${rule_id} title`),
		evidence: snippets.map((snippet) => ({ path: 'x.zip:lib/a.js', line: 1, snippet })),
	});
	const accept = (rule_id, snippet, reason = 'because') => ({ rule_id, snippet, reason });

	it('passes a finding that was accepted for its rule and evidence, saying why', () => {
		const result = evaluate(report([withEvidence('EGO-A-005', 'manual_review', ['St.Clipboard.get_default()'])]), [
			accept('EGO-A-005', 'St.Clipboard.get_default()', 'copying is the purpose'),
		]);
		expect(result).toEqual({
			ok: true,
			lines: ['shexli: no findings', 'accepted EGO-A-005 (St.Clipboard.get_default()): copying is the purpose'],
		});
	});

	it('still fails a finding of an accepted rule when the evidence is different', () => {
		const result = evaluate(report([withEvidence('EGO-A-005', 'manual_review', ['St.Clipboard.get_primary()'])]), [
			accept('EGO-A-005', 'St.Clipboard.get_default()'),
		]);
		expect(result.ok).toBe(false);
		expect(result.lines).toEqual([
			'shexli: 1 finding',
			'manual_review EGO-A-005: EGO-A-005 title',
			'stale: accepted EGO-A-005 (St.Clipboard.get_default()) was not reported, remove it',
		]);
	});

	it('still fails a finding with the accepted evidence for another rule', () => {
		const result = evaluate(report([withEvidence('EGO-A-006', 'error', ['St.Clipboard.get_default()'])]), [
			accept('EGO-A-005', 'St.Clipboard.get_default()'),
		]);
		expect(result.ok).toBe(false);
	});

	it('does not accept a finding that has more evidence than was accepted', () => {
		const result = evaluate(
			report([
				withEvidence('EGO-A-005', 'manual_review', [
					'St.Clipboard.get_default()',
					'St.Clipboard.get_default()',
					'other',
				]),
			]),
			[accept('EGO-A-005', 'St.Clipboard.get_default()')],
		);
		expect(result.ok).toBe(false);
	});

	it.each([[undefined], [[]]])('never accepts a finding without evidence (%j)', (evidence) => {
		const bare = { ...finding('EGO-A-005', 'manual_review', 'x'), evidence };
		expect(evaluate(report([bare]), [accept('EGO-A-005', 'x')]).ok).toBe(false);
	});

	it('reports the other findings as usual, and counts only those', () => {
		const result = evaluate(
			report([withEvidence('EGO-A-005', 'manual_review', ['a']), withEvidence('EGO-L-002', 'warning', ['b'])]),
			[accept('EGO-A-005', 'a')],
		);
		expect(result.lines).toEqual([
			'shexli: 1 finding',
			'warning EGO-L-002: EGO-L-002 title',
			'accepted EGO-A-005 (a): because',
		]);
	});

	it('does not accept a finding whose evidence is malformed, and does not throw on it', () => {
		const broken = { ...finding('EGO-A-005', 'manual_review', 'x'), evidence: [null] };
		expect(evaluate(report([broken]), [accept('EGO-A-005', 'x')]).ok).toBe(false);
	});

	it('fails when an accepted finding is no longer reported, so the list does not rot', () => {
		const result = evaluate(report([]), [accept('EGO-A-005', 'a')]);
		expect(result.ok).toBe(false);
		expect(result.lines).toEqual(['shexli: no findings', 'stale: accepted EGO-A-005 (a) was not reported, remove it']);
	});

	it('accepts each entry once: two findings need two entries', () => {
		const twice = report([
			withEvidence('EGO-A-005', 'manual_review', ['a']),
			withEvidence('EGO-A-005', 'manual_review', ['a']),
		]);
		expect(evaluate(twice, [accept('EGO-A-005', 'a')]).ok).toBe(false);
		expect(evaluate(twice, [accept('EGO-A-005', 'a'), accept('EGO-A-005', 'a')]).ok).toBe(true);
	});
});

describe('main', () => {
	const deps = (overrides = {}) => {
		const out = [];
		const err = [];
		return {
			out,
			err,
			deps: {
				cwd: '/work/tree',
				accepted: [],
				run: vi.fn(() => ({ status: 0, stdout: JSON.stringify(report([])), stderr: '' })),
				stdout: (line) => out.push(line),
				stderr: (line) => err.push(line),
				...overrides,
			},
		};
	};

	it('runs shexli on the absolute path, asking for JSON', () => {
		const { deps: d } = deps();
		main(['dist/x.zip'], d);
		expect(d.run).toHaveBeenCalledWith('shexli', ['--format', 'json', '/work/tree/dist/x.zip']);
		main(['/abs/y.zip'], d);
		expect(d.run).toHaveBeenLastCalledWith('shexli', ['--format', 'json', '/abs/y.zip']);
	});

	it('exits 0 and says so when there are no findings', () => {
		const { deps: d, out, err } = deps();
		expect(main(['x.zip'], d)).toBe(0);
		expect(out).toEqual(['shexli: no findings']);
		expect(err).toEqual([]);
	});

	it('exits 1 and lists the findings when there are some', () => {
		const { deps: d, out } = deps({
			run: () => ({
				status: 0,
				stdout: JSON.stringify(report([finding('EGO-L-002', 'warning', 'Objects are not destroyed')])),
				stderr: '',
			}),
		});
		expect(main(['x.zip'], d)).toBe(1);
		expect(out).toEqual(['shexli: 1 finding', 'warning EGO-L-002: Objects are not destroyed']);
	});

	it('does not fail on the findings that were accepted', () => {
		const accepted = [{ rule_id: 'EGO-A-005', snippet: 'a', reason: 'fine' }];
		const clipboard = {
			...finding('EGO-A-005', 'manual_review', 'Clipboard'),
			evidence: [{ path: 'p', line: 1, snippet: 'a' }],
		};
		const { deps: d, out } = deps({
			accepted,
			run: () => ({ status: 0, stdout: JSON.stringify(report([clipboard])), stderr: '' }),
		});
		expect(main(['x.zip'], d)).toBe(0);
		expect(out).toEqual(['shexli: no findings', 'accepted EGO-A-005 (a): fine']);
	});

	it.each([[[]], [['a', 'b']]])('prints usage and exits 2 for arguments %j', (args) => {
		const { deps: d, err } = deps();
		expect(main(args, d)).toBe(2);
		expect(err).toEqual(['Usage: check-shexli <extension zip or directory>']);
		expect(d.run).not.toHaveBeenCalled();
	});

	it('exits 1 with an explanation when shexli is not installed', () => {
		const { deps: d, err } = deps({
			run: () => ({ error: new Error('spawn shexli ENOENT'), status: null, stdout: '', stderr: '' }),
		});
		expect(main(['x.zip'], d)).toBe(1);
		expect(err).toEqual(['Could not run shexli: spawn shexli ENOENT']);
	});

	it('exits 1, passing its message on, when shexli crashes', () => {
		const { deps: d, err } = deps({ run: () => ({ status: 3, stdout: '', stderr: 'Traceback: boom' }) });
		expect(main(['x.zip'], d)).toBe(1);
		expect(err).toEqual(['shexli failed (exit status 3):', 'Traceback: boom']);
	});

	it('exits 1 when shexli prints something that is not JSON', () => {
		const { deps: d, out, err } = deps({ run: () => ({ status: 0, stdout: 'not json', stderr: '' }) });
		expect(main(['x.zip'], d)).toBe(1);
		expect(err).toEqual(['shexli: its output is not valid JSON']);
		expect(out).toEqual([]);
	});
});

describe('the command line', () => {
	let dir;
	let savedPath;
	let savedArgv;

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), 'emoji-shexli-'));
		savedPath = process.env.PATH;
		savedArgv = process.argv;
		vi.resetModules();
	});
	afterEach(() => {
		process.env.PATH = savedPath;
		process.argv = savedArgv;
		process.exitCode = undefined;
		vi.restoreAllMocks();
		vi.doUnmock('../../scripts/lib/shexli-accepted.mjs');
		rmSync(dir, { recursive: true, force: true });
	});

	/** Runs scripts/check-shexli.mjs in-process against a fake `shexli` that prints `output`. */
	async function runCli(output, { status = 0, stderr = '' } = {}) {
		const fake = path.join(dir, 'shexli');
		// The output goes through files, so no quoting of the JSON is involved.
		writeFileSync(`${fake}.stdout`, output);
		writeFileSync(`${fake}.stderr`, stderr);
		writeFileSync(fake, `#!/bin/sh\ncat "$0.stdout"\ncat "$0.stderr" >&2\nexit ${status}\n`);
		chmodSync(fake, 0o755);
		process.env.PATH = `${dir}:${savedPath}`;
		process.argv = ['node', 'check-shexli.mjs', 'x.zip'];
		const lines = [];
		vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));
		vi.spyOn(console, 'error').mockImplementation((line) => lines.push(line));
		// (What the project has accepted is tested with the project's rules, not here.)
		vi.doMock('../../scripts/lib/shexli-accepted.mjs', () => ({ ACCEPTED_FINDINGS: [] }));
		await import('../../scripts/check-shexli.mjs');
		return lines;
	}

	it('exits 0 for a clean report', async () => {
		const lines = await runCli(JSON.stringify(report([])));
		expect(process.exitCode).toBe(0);
		expect(lines).toEqual(['shexli: no findings']);
	});

	it('exits 1 and reports on stderr when shexli itself fails', async () => {
		const lines = await runCli('', { status: 3, stderr: 'Traceback: boom' });
		expect(process.exitCode).toBe(1);
		expect(lines).toEqual(['shexli failed (exit status 3):', 'Traceback: boom']);
	});

	it('prints a finding whose title contains quotes', async () => {
		const lines = await runCli(JSON.stringify(report([finding('EGO-L-002', 'warning', "Don't leak 'objects'")])));
		expect(process.exitCode).toBe(1);
		expect(lines).toEqual(['shexli: 1 finding', "warning EGO-L-002: Don't leak 'objects'"]);
	});

	it('exits 1 for a report with a finding', async () => {
		const lines = await runCli(JSON.stringify(report([finding('EGO-L-002', 'warning', 'x')])));
		expect(process.exitCode).toBe(1);
		expect(lines).toEqual(['shexli: 1 finding', 'warning EGO-L-002: x']);
	});
});
