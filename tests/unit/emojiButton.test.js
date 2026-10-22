import { beforeEach, describe, expect, it, vi } from 'vitest';
import Clutter from 'gi://Clutter';

import { Emoji } from '../../src/lib/emoji.ts';
import { EmojiButton } from '../../src/lib/emojiButton.ts';
import { ButtonEvent, KeyEvent } from '../support/fakes/toolkit.js';
import { createSettings } from '../support/settings.js';

const LIGHT = '\u{1F3FB}';
const MEDIUM_LIGHT = '\u{1F3FC}';
const SHIFT = 1;
const CTRL = 4;
const RETURN = 0xff0d;
const KEYPAD_ENTER = 0xff8d;

describe('EmojiButton', () => {
	let settings;
	let context;
	let copy;

	beforeEach(() => {
		({ settings } = createSettings());
		copy = vi.fn();
		context = { settings, copy };
	});

	const thumbsUp = new Emoji('👍', ['thumbs up', 'HAS_TONE']);

	describe('appearance', () => {
		it('is a focusable button labelled with the character', () => {
			const { actor } = new EmojiButton(context, new Emoji('😀', ['grinning face']));
			expect(actor.style_class).toBe('EmojisItemStyle');
			expect(actor.can_focus).toBe(true);
			expect(actor.label).toBe('😀');
		});

		it('is empty when it shows no catalogue emoji', () => {
			expect(new EmojiButton(context, null).actor.label).toBe('');
		});

		it('listens to clicks and key presses, and to nothing else without a hover handler', () => {
			const { actor } = new EmojiButton(context, thumbsUp);
			expect(actor.connectedSignals().sort()).toEqual(['button-press-event', 'key-press-event']);
		});

		it('sizes the emoji with a white font', () => {
			const button = new EmojiButton(context, thumbsUp);
			button.setSize(42);
			expect(button.actor.style).toBe('font-size: 42px; color: #FFFFFF;');
			button.setSize(10);
			expect(button.actor.style).toBe('font-size: 10px; color: #FFFFFF;');
		});
	});

	describe('hover', () => {
		it('tells the name of the emoji when hovered, and null when no longer', () => {
			const onHover = vi.fn();
			const { actor } = new EmojiButton(context, new Emoji('😀', ['grinning face', 'grin']), onHover);
			expect(actor.connectedSignals().sort()).toEqual(['button-press-event', 'key-press-event', 'notify::hover']);
			actor.setHover(true);
			expect(onHover).toHaveBeenLastCalledWith('grinning face');
			actor.setHover(false);
			expect(onHover).toHaveBeenLastCalledWith(null);
			expect(onHover).toHaveBeenCalledTimes(2);
		});
	});

	describe('what gets copied', () => {
		it('is the emoji with the chosen skin tone', () => {
			settings.skinTone = 2;
			const button = new EmojiButton(context, thumbsUp);
			button.onButtonPress(new ButtonEvent(1));
			expect(copy).toHaveBeenCalledWith(`👍${MEDIUM_LIGHT}`, 'replace-and-close');
		});

		it('follows the settings at the time of the click, not of the creation', () => {
			const button = new EmojiButton(context, thumbsUp);
			settings.skinTone = 1;
			button.onButtonPress(new ButtonEvent(1));
			expect(copy).toHaveBeenCalledWith(`👍${LIGHT}`, 'replace-and-close');
		});

		it('is the label as it is for a slot that is not tied to a catalogue emoji', () => {
			settings.skinTone = 3;
			const button = new EmojiButton(context, null);
			button.actor.label = `👍${LIGHT}`;
			button.onButtonPress(new ButtonEvent(1));
			expect(copy).toHaveBeenCalledWith(`👍${LIGHT}`, 'replace-and-close');
		});

		it('is nothing, and the event goes on, when the button is empty', () => {
			const button = new EmojiButton(context, null);
			expect(button.onButtonPress(new ButtonEvent(1))).toBe(Clutter.EVENT_PROPAGATE);
			expect(button.onKeyPress(new KeyEvent(RETURN))).toBe(Clutter.EVENT_PROPAGATE);
			expect(copy).not.toHaveBeenCalled();
		});
	});

	describe('onButtonPress', () => {
		const click = (mouseButton) =>
			new EmojiButton(context, new Emoji('😀', ['grinning face'])).onButtonPress(new ButtonEvent(mouseButton));

		it.each([
			[1, 'replace-and-close'],
			[2, 'replace'],
			[3, 'append'],
		])('mouse button %i copies with mode %s and stops the event', (mouseButton, mode) => {
			expect(click(mouseButton)).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('😀', mode);
		});

		it.each([0, 4, 8])('lets mouse button %i go, and copies nothing', (mouseButton) => {
			expect(click(mouseButton)).toBe(Clutter.EVENT_PROPAGATE);
			expect(copy).not.toHaveBeenCalled();
		});

		it('is wired to the button-press-event signal', () => {
			const { actor } = new EmojiButton(context, thumbsUp);
			expect(actor.emit('button-press-event', new ButtonEvent(2))).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'replace');
		});
	});

	describe('onKeyPress', () => {
		const press = (symbol, state = 0) => new EmojiButton(context, thumbsUp).onKeyPress(new KeyEvent(symbol, state));

		it.each([
			['Return', RETURN],
			['keypad Enter', KEYPAD_ENTER],
		])('%s copies and closes the menu', (name, symbol) => {
			expect(press(symbol)).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'replace-and-close');
		});

		it('Ctrl+Enter copies and stays', () => {
			expect(press(RETURN, CTRL)).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'replace');
		});

		it('Shift+Enter appends and stays', () => {
			expect(press(RETURN, SHIFT)).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'append');
		});

		it('Shift wins over Ctrl', () => {
			press(RETURN, SHIFT | CTRL);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'append');
		});

		it('ignores unrelated modifier bits', () => {
			press(RETURN, 0x10 | 0x8);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'replace-and-close');
		});

		it('lets any other key go', () => {
			expect(press(0x61)).toBe(Clutter.EVENT_PROPAGATE);
			expect(copy).not.toHaveBeenCalled();
		});

		it('is wired to the key-press-event signal', () => {
			const { actor } = new EmojiButton(context, thumbsUp);
			expect(actor.emit('key-press-event', new KeyEvent(RETURN))).toBe(Clutter.EVENT_STOP);
			expect(copy).toHaveBeenCalledExactlyOnceWith('👍', 'replace-and-close');
		});
	});
});
