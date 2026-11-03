import { beforeEach, describe, expect, it } from 'vitest';

import { Clipboard } from '../../src/lib/clipboard.ts';
import { clipboard as fake } from '../support/shell-state.js';

const CLIPBOARD = 1;

describe('Clipboard', () => {
	let clipboard;

	beforeEach(() => {
		clipboard = new Clipboard();
		fake.contents = 'old';
	});

	it('replaces the content', () => {
		clipboard.replace('😀');
		expect(fake.contents).toBe('😀');
	});

	it('adds to the content once the clipboard has answered', () => {
		clipboard.append('😀');
		expect(fake.contents).toBe('old');
		fake.flush();
		expect(fake.contents).toBe('old😀');
	});

	it('appends to what the clipboard held when it was asked, not when it answered', () => {
		clipboard.append('😀');
		fake.contents = 'newer';
		fake.flush();
		expect(fake.contents).toBe('old😀');
	});

	it('starts from nothing when the clipboard is empty', () => {
		fake.contents = null;
		clipboard.append('😀');
		fake.flush();
		expect(fake.contents).toBe('😀');
	});

	it('only ever uses the Ctrl+V clipboard, never the middle-click selection', () => {
		clipboard.replace('😀');
		clipboard.append('😁');
		fake.flush();
		expect(fake.writes.map((write) => write.type)).toEqual([CLIPBOARD, CLIPBOARD]);
		expect(fake.reads).toEqual([{ type: CLIPBOARD }]);
		expect(fake.buffers[0]).toBeNull();
	});
});
