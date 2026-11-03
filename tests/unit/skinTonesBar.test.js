import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkinTonesBar } from '../../src/lib/skinTonesBar.ts';
import { Actor } from '../support/fakes/toolkit.js';
import { createSettings } from '../support/settings.js';
import { extensionState } from '../support/shell-state.js';

const TONE_NAMES = [
	'No skin tone',
	'Light skin tone',
	'Medium light skin tone',
	'Medium skin tone',
	'Medium dark skin tone',
	'Dark skin tone',
];
const TONE_COLOURS = ['#FFEE00', '#FFD8A8', '#E5B590', '#B88750', '#9B6020', '#4B2000'];

describe('SkinTonesBar', () => {
	let raw;
	let settings;

	beforeEach(() => {
		({ raw, settings } = createSettings());
		// A pseudo-locale proves every visible name goes through gettext.
		extensionState.translate = (text) => `«${text}»`;
	});

	/** The bar's buttons as a real category item would receive them. */
	function mounted(bar) {
		const host = new Actor();
		bar.addTo(host);
		return host.children;
	}

	const checked = (buttons) => buttons.map((b) => b.checked);

	describe('without gender buttons', () => {
		let bar;
		beforeEach(() => {
			bar = new SkinTonesBar(settings, false);
		});

		it('offers six translated skin tones, each with its colour', () => {
			const buttons = mounted(bar);
			expect(buttons).toHaveLength(6);
			expect(buttons.map((b) => b.accessible_name)).toEqual(TONE_NAMES.map((n) => `«${n}»`));
			expect(buttons.map((b) => b.style)).toEqual(TONE_COLOURS.map((c) => `background-color: ${c};`));
		});

		it('builds tone buttons that are focusable, hoverable toggles', () => {
			for (const button of mounted(bar)) {
				expect(button.reactive).toBe(true);
				expect(button.can_focus).toBe(true);
				expect(button.track_hover).toBe(true);
				expect(button.toggle_mode).toBe(true);
				expect(button.style_class).toBe('EmojisTone');
			}
		});

		it('starts with the stored skin tone selected', () => {
			expect(checked(mounted(bar))).toEqual([true, false, false, false, false, false]);
			raw.set_int('skin-tone', 4);
			expect(checked(mounted(new SkinTonesBar(settings, false)))).toEqual([false, false, false, false, true, false]);
		});

		it.each([0, 1, 2, 3, 4, 5])('clicking tone %i stores it and selects only that one', (tone) => {
			const buttons = mounted(bar);
			buttons[tone].click();
			expect(settings.skinTone).toBe(tone);
			expect(checked(buttons)).toEqual([0, 1, 2, 3, 4, 5].map((i) => i === tone));
		});

		it('shows the stored tone, not the clicked one, when the setting is locked', () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			raw.set_int('skin-tone', 2);
			const buttons = mounted(new SkinTonesBar(settings, false));
			raw.lock('skin-tone');
			buttons[4].click();
			expect(settings.skinTone).toBe(2);
			expect(checked(buttons)).toEqual([false, false, true, false, false, false]);
			expect(warn).toHaveBeenCalledOnce();
			warn.mockRestore();
		});

		it('keeps a tone selected when it is clicked again', () => {
			const buttons = mounted(bar);
			buttons[3].click();
			buttons[3].click();
			expect(checked(buttons)).toEqual([false, false, false, true, false, false]);
			expect(settings.skinTone).toBe(3);
		});

		it('has no gender buttons, so update() leaves the gender setting alone', () => {
			raw.set_int('gender', 2);
			bar.update();
			expect(settings.gender).toBe(2);
			expect(bar.genders).toEqual([]);
			expect(mounted(bar)).toHaveLength(6);
		});

		it('update() reflects the stored tone again after it changed elsewhere', () => {
			const buttons = mounted(bar);
			buttons[1].click();
			raw.set_int('skin-tone', 5);
			bar.update();
			expect(checked(buttons)).toEqual([false, false, false, false, false, true]);
		});
	});

	describe('with gender buttons', () => {
		let bar;
		let buttons;
		let women;
		let men;
		let tones;
		beforeEach(() => {
			bar = new SkinTonesBar(settings, true);
			buttons = mounted(bar);
			[women, men, ...tones] = buttons;
		});

		it('puts the women and men buttons before the six tones', () => {
			expect(buttons).toHaveLength(8);
			expect(bar.genders).toEqual([women, men]);
			expect(tones.map((b) => b.style_class)).toEqual(Array(6).fill('EmojisTone'));
			expect([women, men].map((b) => b.style_class)).toEqual(['EmojisGender', 'EmojisGender']);
			expect([women, men].map((b) => b.label)).toEqual(['♀', '♂']);
			expect([women, men].map((b) => b.accessible_name)).toEqual(['«Women»', '«Men»']);
		});

		it('builds gender buttons that are focusable, hoverable toggles', () => {
			for (const button of [women, men]) {
				expect(button.reactive).toBe(true);
				expect(button.can_focus).toBe(true);
				expect(button.track_hover).toBe(true);
				expect(button.toggle_mode).toBe(true);
			}
		});

		it('starts with no gender selected', () => {
			expect(checked([women, men])).toEqual([false, false]);
		});

		it.each([
			[1, [true, false]],
			[2, [false, true]],
		])('starts with the stored gender %i selected', (gender, expected) => {
			raw.set_int('gender', gender);
			expect(checked(mounted(new SkinTonesBar(settings, true)).slice(0, 2))).toEqual(expected);
		});

		it('selecting a gender stores it', () => {
			women.click();
			expect(settings.gender).toBe(1);
			expect(checked([women, men])).toEqual([true, false]);
			men.click();
			expect(settings.gender).toBe(2);
			expect(checked([women, men])).toEqual([false, true]);
		});

		it('clicking the selected gender again clears it', () => {
			women.click();
			women.click();
			expect(settings.gender).toBe(0);
			expect(checked([women, men])).toEqual([false, false]);
			men.click();
			men.click();
			expect(settings.gender).toBe(0);
			expect(checked([women, men])).toEqual([false, false]);
		});

		it('update() syncs both the tone and the gender with the settings', () => {
			women.set_checked(true);
			men.set_checked(true);
			tones[4].set_checked(true);
			raw.set_int('skin-tone', 2);
			raw.set_int('gender', 0);
			bar.update();
			expect(checked([women, men])).toEqual([false, false]);
			expect(checked(tones)).toEqual([false, false, true, false, false, false]);
			raw.set_int('gender', 2);
			bar.update();
			expect(checked([women, men])).toEqual([false, true]);
			raw.set_int('gender', 1);
			bar.update();
			expect(checked([women, men])).toEqual([true, false]);
		});

		it('a tone click does not change the gender', () => {
			raw.set_int('gender', 2);
			tones[3].click();
			expect(settings.gender).toBe(2);
		});
	});

	it('checks no skin tone, and does not throw, for a stored tone it does not know', () => {
		({ raw, settings } = createSettings({ enforce: false }));
		raw.set_int('skin-tone', 9);
		const bar = new SkinTonesBar(settings, true);
		expect(bar.tones.map((button) => button.checked)).toEqual(Array(6).fill(false));
	});
});
