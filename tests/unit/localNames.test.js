import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadLocalNames, nameDataKeys } from '../../src/lib/localNames.ts';

describe('nameDataKeys', () => {
	it.each([
		[
			['fr_FR.UTF-8', 'fr_FR', 'fr', 'C'],
			['fr-FR', 'fr'],
		],
		[
			['de_DE@euro', 'de_DE', 'de'],
			['de-DE', 'de'],
		],
		[
			['pt_PT.UTF-8', 'pt_PT', 'pt'],
			['pt-PT', 'pt'],
		],
		[
			['pt_BR.UTF-8', 'pt_BR', 'pt'],
			['pt-BR', 'pt'],
		],
		[['ja'], ['ja']],
		[
			['es_MX', 'es'],
			['es-MX', 'es'],
		],
	])('lists the data of %j, most specific first: %j', (names, keys) => {
		expect(nameDataKeys(names)).toEqual(keys);
	});

	it.each([
		[['zh_CN.UTF-8'], ['zh']],
		[['zh_CN'], ['zh']],
		[['zh_SG'], ['zh']],
		[['zh_TW'], ['zh-Hant']],
		[['zh_HK'], ['zh-Hant-HK']],
		[['sr_RS@latin'], ['sr-Latn']],
		[['sr@latin'], ['sr-Latn']],
		[
			['zh_TW', 'zh'],
			['zh-Hant', 'zh'],
		],
		[
			['zh_HK.UTF-8', 'zh_HK', 'zh'],
			['zh-Hant-HK', 'zh'],
		],
		[
			['sr_RS@latin', 'sr@latin', 'sr_RS', 'sr'],
			['sr-Latn', 'sr-RS', 'sr'],
		],
		[
			['sr@latin', 'sr'],
			['sr-Latn', 'sr'],
		],
	])('names the script of the Chinese and Serbian of %j: %j', (names, keys) => {
		expect(nameDataKeys(names)).toEqual(keys);
	});

	it.each([
		[
			['nb_NO.UTF-8', 'nb_NO', 'nb'],
			['no-NO', 'no'],
		],
		[
			['tl_PH', 'tl'],
			['fil-PH', 'fil'],
		],
	])('uses the CLDR name of the language of %j: %j', (names, keys) => {
		expect(nameDataKeys(names)).toEqual(keys);
	});

	it('has nothing for English, which the emoji are named in already', () => {
		expect(nameDataKeys(['en_GB.UTF-8', 'en_GB', 'en', 'C'])).toEqual([]);
		expect(nameDataKeys(['en_US', 'en'])).toEqual([]);
	});

	it('has nothing for the locales without a language', () => {
		expect(nameDataKeys(['C'])).toEqual([]);
		expect(nameDataKeys(['POSIX'])).toEqual([]);
		expect(nameDataKeys([])).toEqual([]);
		expect(nameDataKeys([''])).toEqual([]);
	});

	it('goes on to the next language after English', () => {
		expect(nameDataKeys(['en_GB', 'en', 'fr'])).toEqual(['fr']);
	});

	it.each([
		['../../prefs', []],
		['fr/../../prefs', []],
		['xx_../../prefs', ['xx']],
		['fr_FR/x', ['fr']],
		['f r', []],
		['fr\\x', []],
		['fr:x', []],
		['fr.js?x', ['fr']],
		['fr_FR@../x', ['fr-FR', 'fr']],
		['\u0000', []],
	])('does not take %j for more than the language in it, whatever the environment of the user says', (name, keys) => {
		expect(nameDataKeys([name])).toEqual(keys);
	});

	it('lists each only once', () => {
		expect(nameDataKeys(['fr_FR', 'fr_FR', 'fr', 'fr', 'fr_FR.UTF-8'])).toEqual(['fr-FR', 'fr']);
	});
});

describe('loadLocalNames', () => {
	const fr = ['chat|félin', 'chien|animal'];

	it('loads the data of the first language that has some', async () => {
		const load = vi.fn((key) =>
			key === 'fr' ? Promise.resolve({ default: fr }) : Promise.reject(new Error(`no ${key}`)),
		);
		expect(await loadLocalNames(['fr_FR.UTF-8', 'fr_FR', 'fr', 'C'], load)).toEqual({ key: 'fr', data: fr });
		expect(load.mock.calls.map(([key]) => key)).toEqual(['fr-FR', 'fr']);
	});

	it('stops at the first language that has some', async () => {
		const load = vi.fn(() => Promise.resolve({ default: fr }));
		await loadLocalNames(['fr_FR', 'fr', 'de'], load);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('has none when no language has any', async () => {
		const load = vi.fn(() => Promise.reject(new Error('no such module')));
		expect(await loadLocalNames(['xx_YY', 'xx'], load)).toBeNull();
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('loads nothing for English', async () => {
		const load = vi.fn();
		expect(await loadLocalNames(['en_GB', 'en', 'C'], load)).toBeNull();
		expect(load).not.toHaveBeenCalled();
	});

	it('goes on past data that is not a list of texts', async () => {
		const bad = [{ default: 'text' }, { default: null }, {}, { default: [1, 2] }, { default: [['a']] }, null];
		for (const module of bad) {
			const load = vi.fn((key) => Promise.resolve(key === 'fr-FR' ? module : { default: fr }));
			expect(await loadLocalNames(['fr_FR', 'fr'], load), JSON.stringify(module)).toEqual({ key: 'fr', data: fr });
		}
	});

	describe('a language that inherits from another', () => {
		const modules = {
			'fr-CA': { parent: 'fr', default: ['', 'chat canadien', ''] },
			fr: { parent: null, default: ['visage', 'chat', ''] },
			'zh-Hant-HK': { parent: 'zh-Hant', default: ['', '', 'hk'] },
			'zh-Hant': { parent: 'zh-Hant-TW', default: ['a', 'b', 'c'] },
			'zh-Hant-TW': { parent: null, default: ['x', 'y', 'z'] },
		};
		const load = vi.fn((key) =>
			key in modules ? Promise.resolve(modules[key]) : Promise.reject(new Error(`no ${key}`)),
		);

		beforeEach(() => {
			load.mockClear();
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		});
		afterEach(() => vi.restoreAllMocks());

		it('has the emojis that it does not name from its parent', async () => {
			expect(await loadLocalNames(['fr_CA'], load)).toEqual({ key: 'fr-CA', data: ['visage', 'chat canadien', ''] });
			expect(load.mock.calls.map(([key]) => key)).toEqual(['fr-CA', 'fr']);
		});

		it('takes from each ancestor what the nearer ones do not name', async () => {
			const chain = { ...modules, 'zh-Hant-HK': { parent: 'zh-Hant', default: ['', '', 'hk'] } };
			const loaded = await loadLocalNames(['zh_HK'], (key) =>
				key in chain ? Promise.resolve(chain[key]) : Promise.reject(new Error(`no ${key}`)),
			);
			expect(loaded).toEqual({ key: 'zh-Hant-HK', data: ['a', 'b', 'hk'] });
		});

		it('does not go round in circles, or go further than four', async () => {
			const circle = { aa: { parent: 'bb', default: ['1', ''] }, bb: { parent: 'aa', default: ['2', '3'] } };
			const asked = [];
			const loaded = await loadLocalNames(['aa'], (key) => {
				asked.push(key);
				return Promise.resolve(circle[key]);
			});
			expect(loaded).toEqual({ key: 'aa', data: ['1', '3'] });
			expect(asked).toEqual(['aa', 'bb']);
			const loop = {
				aa: { parent: 'bb', default: [''] },
				bb: { parent: 'cc', default: [''] },
				cc: { parent: 'bb', default: ['3'] },
			};
			asked.length = 0;
			await loadLocalNames(['aa'], (key) => {
				asked.push(key);
				return Promise.resolve(loop[key]);
			});
			expect(asked).toEqual(['aa', 'bb', 'cc']);
			const calls = [];
			const long = (key) => {
				calls.push(key);
				return Promise.resolve({ parent: `${key}x`, default: [key] });
			};
			await loadLocalNames(['a'], long);
			expect(calls).toEqual(['a', 'ax', 'axx', 'axxx']);
		});

		it('complains, and keeps what it has, when a parent cannot be loaded', async () => {
			const loaded = await loadLocalNames(['fr_CA'], (key) =>
				key === 'fr-CA' ? Promise.resolve(modules['fr-CA']) : Promise.reject(new Error('gone')),
			);
			expect(loaded).toEqual({ key: 'fr-CA', data: ['', 'chat canadien', ''] });
			expect(console.error).toHaveBeenCalledWith(
				"Cannot load the emoji names 'fr', which 'fr-CA' inherits from",
				expect.any(Error),
			);
		});

		it.each([
			['not the same size', { parent: null, default: ['a'] }],
			['not a list of texts', { parent: null, default: [1, 2, 3] }],
			['nothing', {}],
		])('complains, and keeps what it has, when a parent is %s', async (_what, parent) => {
			const odd = { 'fr-CA': modules['fr-CA'], fr: parent };
			const loaded = await loadLocalNames(['fr_CA'], (key) => Promise.resolve(odd[key]));
			expect(loaded).toEqual({ key: 'fr-CA', data: ['', 'chat canadien', ''] });
			expect(console.error).toHaveBeenCalledWith(
				"Ignoring the emoji names 'fr', which 'fr-CA' inherits from: not a list of texts of the same size",
			);
		});

		it('does not import a parent whose name is not a language', async () => {
			const names = [];
			const sneaky = (key) => {
				names.push(key);
				return Promise.resolve({ parent: '../../prefs', default: ['a'] });
			};
			const loaded = await loadLocalNames(['fr'], sneaky);
			expect(loaded).toEqual({ key: 'fr', data: ['a'] });
			expect(names).toEqual(['fr']);
			expect(console.error).toHaveBeenCalledWith("Ignoring the parent '../../prefs' of the emoji names 'fr'");
		});

		it('takes a parent that is not a text for no parent', async () => {
			for (const parent of [undefined, null, 5, ['fr']]) {
				const names = [];
				const loaded = await loadLocalNames(['aa'], (key) => {
					names.push(key);
					return Promise.resolve({ parent, default: ['a'] });
				});
				expect(loaded, String(parent)).toEqual({ key: 'aa', data: ['a'] });
				expect(names).toEqual(['aa']);
			}
		});
	});

	describe('what it says', () => {
		let debug;
		let error;
		beforeEach(() => {
			debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
			error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		});
		afterEach(() => {
			debug.mockRestore();
			error.mockRestore();
		});

		it('only says for debugging that a language has no data, with the reason', async () => {
			const reason = new Error('no such module');
			await loadLocalNames(['fr_FR', 'fr'], (key) =>
				key === 'fr' ? Promise.resolve({ default: fr }) : Promise.reject(reason),
			);
			expect(debug).toHaveBeenCalledExactlyOnceWith("No emoji names for 'fr-FR'", reason);
			expect(error).not.toHaveBeenCalled();
		});

		it('says nothing for a language that loads, or for English', async () => {
			await loadLocalNames(['fr'], () => Promise.resolve({ default: fr }));
			await loadLocalNames(['en_GB', 'C'], () => Promise.resolve({ default: fr }));
			expect(debug).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		});

		it('complains of data that is not a list of texts, which is a defect of the package', async () => {
			await loadLocalNames(['de'], () => Promise.resolve({ default: [1, 2] }));
			expect(error).toHaveBeenCalledExactlyOnceWith("Ignoring the emoji names 'de': not a list of texts");
			expect(debug).not.toHaveBeenCalled();
		});
	});

	it('accepts a list with nothing in it', async () => {
		expect(await loadLocalNames(['fr'], () => Promise.resolve({ default: [] }))).toEqual({ key: 'fr', data: [] });
	});
});
