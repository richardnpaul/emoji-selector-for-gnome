import { EXTENSION_DIR, METADATA } from '../support/paths.js';
import { FakeSettings, parseSchema } from '../support/fakes/settings.js';
import { describe, expect, it, vi } from 'vitest';

import { EmojiSettings } from '../../src/lib/settings.ts';

const SCHEMA = parseSchema(`${EXTENSION_DIR}/schemas/${METADATA['settings-schema']}.gschema.xml`);

describe('EmojiSettings', () => {
	const create = () => {
		const raw = new FakeSettings(SCHEMA, { enforce: true });
		return { raw, settings: new EmojiSettings(raw) };
	};

	describe('reading', () => {
		it('has the schema defaults', () => {
			const { settings } = create();
			expect(settings.position).toBe('top');
			expect(settings.columns).toBe(11);
			expect(settings.emojiSize).toBe(30);
			expect(settings.skinTone).toBe(0);
			expect(settings.gender).toBe(0);
			expect(settings.alwaysShow).toBe(true);
			expect(settings.useKeybinding).toBe(true);
			expect(settings.recentlyUsed).toHaveLength(21);
			expect(settings.recentlyUsed.slice(0, 3)).toEqual(['😂', '❤️', '😍']);
		});

		it('follows what is stored', () => {
			const { raw, settings } = create();
			raw.set_string('position', 'bottom');
			raw.set_int('nbcols', 20);
			raw.set_int('emojisize', 44);
			raw.set_int('skin-tone', 3);
			raw.set_int('gender', 2);
			raw.set_boolean('always-show', false);
			raw.set_boolean('use-keybinding', false);
			raw.set_strv('recently-used', ['a', 'b']);
			expect([settings.position, settings.columns, settings.emojiSize, settings.skinTone, settings.gender]).toEqual([
				'bottom',
				20,
				44,
				3,
				2,
			]);
			expect([settings.alwaysShow, settings.useKeybinding, settings.recentlyUsed]).toEqual([false, false, ['a', 'b']]);
		});

		it('treats any position but "bottom" as "top"', () => {
			const stub = { get_string: () => 'left' };
			expect(new EmojiSettings(stub).position).toBe('top');
		});

		it('returns a copy of the recently used list, which cannot change what is stored', () => {
			const { settings } = create();
			settings.recentlyUsed.push('x');
			expect(settings.recentlyUsed).toHaveLength(21);
		});
	});

	describe('writing', () => {
		it('stores the skin tone, the gender and the recently used list', () => {
			const { raw, settings } = create();
			settings.skinTone = 4;
			settings.gender = 1;
			settings.recentlyUsed = ['z'];
			expect([raw.get_int('skin-tone'), raw.get_int('gender'), raw.get_strv('recently-used')]).toEqual([4, 1, ['z']]);
		});

		it.each([
			['skin-tone', (settings) => (settings.skinTone = 3)],
			['gender', (settings) => (settings.gender = 1)],
			['recently-used', (settings) => (settings.recentlyUsed = ['z'])],
		])('says so, and keeps the stored value, when the key %s is locked', (key, write) => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const { raw, settings } = create();
			const before = JSON.stringify([settings.skinTone, settings.gender, settings.recentlyUsed]);
			raw.lock(key);
			write(settings);
			expect(JSON.stringify([settings.skinTone, settings.gender, settings.recentlyUsed])).toBe(before);
			expect(warn).toHaveBeenCalledExactlyOnceWith(
				`Cannot save the setting '${key}': it is locked, or the value is not allowed`,
			);
			warn.mockRestore();
		});

		it('says nothing when the write is accepted', () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const { settings } = create();
			settings.skinTone = 1;
			settings.gender = 1;
			settings.recentlyUsed = ['z'];
			expect(warn).not.toHaveBeenCalled();
			warn.mockRestore();
		});

		it('leaves the stored value alone when GSettings refuses an out-of-range one', () => {
			const { settings } = create();
			settings.skinTone = 2;
			settings.skinTone = 6;
			expect(settings.skinTone).toBe(2);
		});
	});

	describe('watching', () => {
		it('calls back when a key changes, and not for other keys', () => {
			const { raw, settings } = create();
			const calls = [];
			settings.onChanged('emojisize', () => calls.push('size'));
			settings.onChanged('nbcols', () => calls.push('columns'));
			raw.set_int('emojisize', 50);
			expect(calls).toEqual(['size']);
			raw.set_int('nbcols', 12);
			expect(calls).toEqual(['size', 'columns']);
		});

		it('disconnects every handler it connected, once', () => {
			const { raw, settings } = create();
			settings.onChanged('emojisize', () => {});
			settings.onChanged('gender', () => {});
			expect(raw.connectionCount).toBe(2);
			settings.disconnectAll();
			expect(raw.connectionCount).toBe(0);
			expect(() => settings.disconnectAll()).not.toThrow();
		});

		it('hands the underlying Gio.Settings to the Shell, which needs it for key bindings', () => {
			const { raw, settings } = create();
			expect(settings.raw).toBe(raw);
		});
	});
});
