/** The names and keywords of the emojis in one language, as `name|keyword|keyword`, in the order of the table. */
export type NameData = readonly string[];

/** Loads the data of a language by its key (the file `data/names/<key>.js`), or fails if there is none. */
export type ImportNameData = (key: string) => Promise<unknown>;

/** The CLDR data of these locales is in a language or script of another name than the locale's. */
const KEY_OF_LOCALE: Readonly<Record<string, string>> = {
  zh_CN: 'zh',
  zh_SG: 'zh',
  zh_TW: 'zh-Hant',
  zh_HK: 'zh-Hant-HK',
  'sr@latin': 'sr-Latn',
  'sr_RS@latin': 'sr-Latn',
};

/** The CLDR names of the languages that glibc names otherwise. */
const KEY_OF_LANGUAGE: Readonly<Record<string, string>> = {
  nb: 'no',
  tl: 'fil',
};

/** The keys become a file name, so nothing that could leave the directory of the data. */
const SAFE_KEY = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

function keysOf(name: string): string[] {
  const withoutEncoding = name.replace(/\.[^@]*/, '');
  const locale = withoutEncoding.replace(/@.*/, '');
  const language = locale.replace(/_.*/, '');
  const territory = /_(.*)/.exec(locale)?.[1];
  if (language === 'en' || language === 'C' || language === 'POSIX') {
    return [];
  }
  const special = KEY_OF_LOCALE[withoutEncoding];
  const cldr = KEY_OF_LANGUAGE[language] ?? language;
  const keys = special !== undefined ? [special] : territory === undefined ? [cldr] : [`${cldr}-${territory}`, cldr];
  return keys.filter((key) => SAFE_KEY.test(key));
}

/**
 * The keys of the name data to try for a list of locale names (what `GLib.get_language_names()` gives,
 * from the most specific to the least): the language and territory, then the language alone. English has
 * none, since the emojis are named in English already, and `C` has no language.
 */
export function nameDataKeys(localeNames: readonly string[]): string[] {
  return [...new Set(localeNames.flatMap(keysOf))];
}

interface NameModule {
  readonly default: NameData;
  readonly parent?: unknown;
}

function isNameModule(module: unknown): module is NameModule {
  // (A module that is null or undefined throws here, which the loader takes for a language without data.)
  const data = (module as { default?: unknown }).default;
  return Array.isArray(data) && data.every((entry) => typeof entry === 'string');
}

/** More than the longest line of ancestors in CLDR (zh-Hant-HK, zh-Hant), to stop a data error going on for ever. */
const MAX_LAYERS = 4;

/** The language that a module says it inherits from, if it says one that is a key. */
function parentKey(key: string, module: NameModule): string | null {
  if (typeof module.parent !== 'string') {
    return null;
  }
  if (!SAFE_KEY.test(module.parent)) {
    console.error(`Ignoring the parent '${module.parent}' of the emoji names '${key}'`);
    return null;
  }
  return module.parent;
}

/**
 * The data of a language and, after it, that of each language it inherits from (a regional variant only names
 * the emojis that differ from its parent). `null` if the language's own data is not as expected; it throws if
 * there is none. A parent that cannot be had is a defect of the package, which is logged, and the line stops.
 */
async function loadLayers(key: string, importNameData: ImportNameData): Promise<NameData[] | null> {
  const first = await importNameData(key);
  if (!isNameModule(first)) {
    console.error(`Ignoring the emoji names '${key}': not a list of texts`);
    return null;
  }
  const layers = [first.default];
  const seen = new Set([key]);
  let child = key;
  let parent = parentKey(key, first);
  while (parent !== null && layers.length < MAX_LAYERS && !seen.has(parent)) {
    seen.add(parent);
    let module: unknown;
    try {
      module = await importNameData(parent);
    } catch (error) {
      console.error(`Cannot load the emoji names '${parent}', which '${child}' inherits from`, error);
      break;
    }
    if (!isNameModule(module) || module.default.length !== first.default.length) {
      console.error(
        `Ignoring the emoji names '${parent}', which '${child}' inherits from: not a list of texts of the same size`,
      );
      break;
    }
    layers.push(module.default);
    child = parent;
    parent = parentKey(child, module);
  }
  return layers;
}

/** The names of the nearest layer that has one, for each emoji; the layers are from the nearest to the furthest. */
function overlay(layers: readonly NameData[]): NameData {
  return layers.reduceRight<NameData>(
    (below, layer) => layer.map((entry, i) => (entry !== '' ? entry : (below[i] ?? ''))),
    [],
  );
}

/** The names and keywords of the emojis in one language, and the key of that language. */
export interface LoadedNames {
  readonly key: string;
  readonly data: NameData;
}

/**
 * The names and keywords of the emojis in the first of the user's languages that has some, or `null`
 * when none does. Most languages have no data of their own (`de-CH` is `de`), so a failure to load is
 * only logged for debugging; data of the wrong shape is a defect of the package, and is logged as one.
 */
export async function loadLocalNames(
  localeNames: readonly string[],
  importNameData: ImportNameData,
): Promise<LoadedNames | null> {
  for (const key of nameDataKeys(localeNames)) {
    try {
      const layers = await loadLayers(key, importNameData);
      if (layers !== null) {
        return { key, data: overlay(layers) };
      }
    } catch (error) {
      console.debug(`No emoji names for '${key}'`, error);
    }
  }
  return null;
}
