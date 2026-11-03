# Language support plan

Goal: the same breadth of language support as
[gnome-shell-extensions-sync](https://github.com/richardnpaul/gnome-shell-extensions-sync) (140 catalogues), for the
interface **and** for searching emoji in the user's own language.

Status: **Phases 1 to 3 done** (see [Phases](#phases)); the rest is a plan. The languages are listed, with their origin
and tier, in [`languages.md`](languages.md). Decisions marked _(decided)_ were made by the
maintainer; the rest are proposals.

## Decisions so far

- _(decided)_ Scope: interface strings (Track A) **and** emoji names and search keywords (Track B).
- _(decided)_ Interface translations are machine-generated, in the same language set as the sync repo (no Russian),
  except where the findings below show a catalogue could never be used.
- _(decided)_ The 13 existing catalogues are moved aside, every language is regenerated alongside the others, the
  differences are examined and the better wording kept. Then the per-catalogue headers go (see
  [Provenance](#provenance-and-the-headers)).
- _(decided)_ Chinese catalogue naming is fixed (see the findings).
- _(decided)_ Track B as described below. The plan is kept in `docs/`.

## Findings

These were checked, not assumed.

1. **`zh_Hans` is never loaded.** A user's locale expands to a list of candidate names; GLib's
   `get_language_names()` gives, for `zh_CN`, `["zh_CN", "zh", "C"]`, and for `zh_TW`, `["zh_TW", "zh", "C"]`.
   Nothing produces `zh_Hans`, and glibc has no such locale. The catalogue must be named `zh_CN` (plus `zh_TW`,
   `zh_HK`, and a plain `zh` for `zh_SG` and the rest, which is Simplified). The same applies to `es_ES`, which a
   user in Mexico or Argentina never matches: the directory should be `es`. **Done in Phase 1, and proved with the
   real gettext** for users of nine locales (the dev image now has those locales installed; gettext ignores
   `LANGUAGE` under the `C` locale, which is all it had before). Traditional Chinese users (`zh_TW`, `zh_HK`) and
   `zh_SG` get English until Phase 3 adds their catalogues.
2. **18 of the sync repo's 140 languages have no glibc locale**, so a GNOME user cannot select them: `ay bm ceb ch ee fj
gn haw hmn jv nah nv ny prs qu rn sn ty` (checked against the `glibc-langpack-*` packages Fedora 45 ships, which
   follow glibc's supported locales). Such a user is already running in another language, so a catalogue for theirs
   would only be reachable by setting `LANGUAGE` by hand. **Recommendation: skip them, leaving 122.**
3. **CLDR covers 112 of those 122** (CLDR 49 has 108 locale families; Norwegian Bokmål `nb` is `no` there). Without
   emoji data, so Track B falls back to English search: `bo ht iu lg ln mg pap sm st tpi`. Esperanto (`eo`, an
   existing catalogue) is not in CLDR either.

4. **The existing human catalogues are far from complete.** Each lacks 5 to 37 of the 45 strings, with 1 to 7 fuzzy
   entries (a fuzzy entry is never shown). Six had no `Plural-Forms` line, three had a wrong `Language` header
   (Esperanto said `fr`), and Esperanto's plural rule was wrong. Phase 1 fixed the headers; the missing text is
   what Phase 2 fills in.
5. **`msginit` knows plural forms for only a few languages** (`ja` and `he` yes; `ar`, `zh_CN`, `ca`, `cy` and `ak`
   no), and writes `Language: pt` for `pt_PT`. The catalogue script therefore sets the `Language` header itself and
   warns when plural forms are missing; Phase 3 adds a reviewed table of plural forms for every language (derived
   from CLDR's plural rules and checked against them).

## English

English has no catalogue: the source strings (the `msgid`s) are the English, written in **British English**, and serve
every English locale. A locale expands to its own name, then its language, then the source text, as GLib shows:
`en_GB` gives `en_GB`, `en`, `C`; `en_US` gives `en_US`, `en`, `C`. So an `en_US` catalogue, if one is ever needed,
is only consulted for `en_US` users and cannot stand in for `en_GB`. Today no string differs between the two (the
template was checked), so none is needed; if one does, add `en_US` (and `en_CA` and so on only where that locale differs
again). A test rejects the common American spellings in the template. The rule is in
`.agents/rules/localisation-rules.md`.

## Fallback for the languages skipped (and the weakest ones kept)

gettext and GLib fall back along the user's own language list only, then to English: nothing in the system knows that
a Quechua speaker also reads Spanish. For the 18 skipped languages the fallback is the language their users already
run the desktop in. This table is from general knowledge and needs checking by someone who knows each community;
where several are plausible, the best-resourced is listed first.

| Skipped | Language | Usually runs the desktop in           |
| ------- | -------- | ------------------------------------- |
| `ay`    | Aymara   | Spanish (`es`)                        |
| `bm`    | Bambara  | French (`fr`)                         |
| `ceb`   | Cebuano  | English, Filipino (`fil`)             |
| `ch`    | Chamorro | English                               |
| `ee`    | Ewe      | English, French (Togo)                |
| `fj`    | Fijian   | English                               |
| `gn`    | Guarani  | Spanish (`es`)                        |
| `haw`   | Hawaiian | English                               |
| `hmn`   | Hmong    | English, Vietnamese, Lao, Thai, Hmong |
| `jv`    | Javanese | Indonesian (`id`)                     |
| `nah`   | Nahuatl  | Spanish (`es`)                        |
| `nv`    | Navajo   | English                               |
| `ny`    | Chichewa | English                               |
| `prs`   | Dari     | Persian (`fa`)                        |
| `qu`    | Quechua  | Spanish (`es`)                        |
| `rn`    | Kirundi  | French, Swahili (`sw`), English       |
| `sn`    | Shona    | English                               |
| `ty`    | Tahitian | French (`fr`)                         |

Among the 122 kept, the same argument applies to languages whose speakers nearly all use a larger language every
day (for instance `chr` Cherokee or `iu` Inuktitut). They keep a catalogue because they do have a
selectable locale, but they are the **third tier** below: the first candidates to drop if review shows the machine
translation is poor.

## Provenance and the headers

The maintainer's plan is to move the 13 human catalogues aside, regenerate all languages, compare, then **remove the
catalogue headers**. My reading of "headers": the machine-translation marker proposed earlier, which was there only
to tell machine and human catalogues apart. Once the human ones are compared and merged that distinction is moot in
the files themselves.

Two things should not be lost with the headers, so the proposal is to keep them in **one** place:

- **Translator credit.** The `Last-Translator` lines of the human catalogues are the only record of who did that work
  (the README names some). Copy them to a single `translations/CREDITS` file before deleting anything.
- **Which languages are machine-made.** A table in the README (language, origin: _human_, _machine_, _machine agrees
  with the earlier human version_, tier) rather than a header per file.

To confirm with the maintainer: is that the intended meaning?

## Existing catalogues: compare, then merge

1. Move `ar cs de eo es_ES fr gl it nl oc pl pt_BR zh_Hans` to `translations/human/` (outside `assets/`, so they
   are not packaged). Git history keeps them anyway.
2. Generate the same 13 languages with the new pipeline.
3. Compare entry by entry and classify each difference: identical, wording only, placeholder or format mismatch,
   human entry empty or marked fuzzy, genuinely different meaning.
4. Resolve by rule, because the author of the machine version cannot be the final judge of a native speaker's
   wording: keep the human entry unless it is empty, fuzzy, breaks a placeholder, or is demonstrably wrong; keep the
   differences list for the maintainer. Entries where the two disagree on meaning are flagged for a native speaker
   instead of being decided here.
5. The merged catalogue replaces the old one in `assets/locale/`.

## Track A: interface strings (122 catalogues, about 45 strings each)

- **Naming audit first** (finding 1): `zh_Hans` to `zh_CN`/`zh_TW`/`zh_HK`/`zh`, `es_ES` to `es`; a test checks
  every directory name is one a real locale expands to.
- **Generation as data, not code.** Translations are committed as ordinary `.po` files that `msgmerge` can update,
  not hard-coded in Python dictionaries; a new string falls back to English until it is translated.
- **Rules each catalogue must pass** (tests, in place): valid for `msgfmt --check`; named so a real locale finds it;
  `Language` and `Plural-Forms` headers; every `%s` placeholder preserved; for a machine-made catalogue, every
  message translated, none fuzzy, none identical to English unless on the short allow-list in
  `translations/provenance.json`. Still to come: every `.mo` ships in the package.
- **Tiers**, recorded in the README: tier 1 well-resourced, tier 2 mid, tier 3 low-resource.
- **Real-GNOME tests in other languages.** `test:prefs` and `test:shell` run again under a few locales (a
  left-to-right one, `ja`, and `ar` for right-to-left), proving translated text really loads. This closes the gap
  the test review noted.
- **Dev image.** Add glibc langpacks for the test locales (finding 1). That is a Dockerfile change, so the pinned
  base image and its documentation need updating together.

## Track B: emoji names and search in the user's language

Built as follows (the measurements are those of CLDR 49).

- **Data:** the Unicode CLDR annotations, `cldr-annotations-full` for the emojis and `cldr-annotations-derived-full`
  for the flags, keycaps and others that CLDR names by a rule (without it 265 of our 1,513 emojis have no name), both
  version 49.0.0, licence Unicode-3.0, pinned dev dependencies used only at build time. The package ships none of
  them except the generated data and the licence text (`data/names/UNICODE-LICENSE.txt`).
- **Build step:** `translations/tools/names.mjs` (`npm run build:names`, after `build:ts`) writes
  `dist/extension/data/names/<language>.js`: one text per emoji of the table, in its order, `name|keyword|keyword`
  or empty, and the language it inherits from (`export const parent`). A language with no parent ships if CLDR
  names at least half of our emojis. A regional variant (`fr-CA`, `de-CH`, `pt-PT`, `zh-Hant-HK`...) only says what
  differs from its parent, so it is written as CLDR has it and ships if its parent does and it names anything; the
  parent is what CLDR's supplemental data says (`zh-Hant` has none, `es-MX` inherits from `es-419`) and otherwise the
  locale without its last subtag. English and its variants are not written: the table is in English. 133 files ship, one
  emoji to a line, so that no reviewer takes them for minified code. The build fails if fewer than 100 languages
  come out or if the CLDR files are not as expected, and `build-a-zip.sh` refuses a package without them.
- **Runtime:** `GLib.get_language_names()` gives the locales of the user; `nameDataKeys` turns them into CLDR keys
  (`zh_TW` is `zh-Hant`, `nb` is `no`, `pt_PT` is `pt-PT`, `sr@latin` is `sr-Latn`; English has none; a key that is
  not made of letters, digits and hyphens is dropped, as it becomes a file name); `loadLocalNames` tries them in
  order with a dynamic `import()` and the first that loads wins, with the emojis it does not name taken from the
  languages it inherits from. The session does this after building the menu, so
  the menu is never waiting for it; until it is done, and for a language without data, the extension works in English.
  The data must have one entry per emoji, or it is ignored and the error logged.
- **Search:** both the text typed and the words (English and the user's language) are folded by `fold`: lower case,
  no accents (U+0300 to U+036F, so `cafe` finds `café` but the vowel signs of Hindi stay) and plain spaces (French
  puts a narrow no-break space before a colon). English is always searched too, so existing habits keep working. The
  hover label shows the name in the user's language.
- **Size:** the zip is 3.4 MB, up from 312 KB, under the 5 MiB that extensions.gnome.org allows by default; a test fails
  if the generated data grows beyond 3.5 MB compressed.
- **Without names** (13 interface languages whose users search in English): `ckb eo ht ku lg ln mg oc pap sm st su
tpi`. A test lists them, so a change in the data shows up.

## Phases

Each phase is test-first, keeps coverage and mutation at 100%, and ends with the reviewers on the changed code.

1. **Foundations. Done.** `zh_Hans` is now `zh_CN` and `es_ES` is `es`; the `Language`/`Plural-Forms` headers are
   fixed; `translations/provenance.json` records each catalogue's origin and tier; the dev image has the locales
   for the real gettext test (`tests/integration/catalogues.tooling.test.js`); `new-catalogue.sh` creates a
   skeleton from the template; `ja` and `he` are the pilot (machine made, complete, checked for placeholders).
   `de` is not a pilot: it already exists, so it is the first language compared in Phase 2.
2. **Compare the 13 human catalogues. Done.** `translations/human/` holds them as they were, `translations/machine/`
   the regenerated versions, `assets/locale/` the merge and `translations/comparison.md` the report. Every entry the
   merge changed in a human catalogue is listed there, and a test fails if one is not. 17 entries were plainly wrong
   (for instance "key names" translated as the keys of cryptography in six languages, and angle brackets turned into
   quotation marks or square brackets) and are replaced; 9 are listed for a native speaker to look at. The headers
   were not removed: they carry no marker, and the origin of each catalogue is in `translations/provenance.json`.
3. **Generate the remaining catalogues by region. Done: 113 catalogues in all.** Nine batches were translated in
   parallel by language models from one written brief, each checked by a validator (45 strings, `%s` kept, no empty
   line), then turned into catalogues with `new-catalogue.sh`. Each translator reported which languages it was least
   sure of, and that is recorded as the note of the language in `translations/provenance.json`. What was decided:
   - **Not shipped:** Cherokee (`chr`) and Inuktitut (`iu`). The translator could only translate "Women" and "Men" and
     advised against shipping them; a catalogue that is 95% English is worse than none. Four more were generated and
     then dropped on the maintainer's decision, as the translators described them as mostly loanwords with no
     established desktop vocabulary: Tibetan (`bo`), Sanskrit (`sa`), Fula (`ff`) and Wolof (`wo`).
   - **Not generated, because the base catalogue serves them:** `es_MX` and `es_AR` (the `es` catalogue), `fr_CA`
     (`fr`) and `en_GB` (the extension has no English word that differs). `zh_SG` also uses nothing yet.
   - **Plural forms** come from CLDR by `translations/tools/plural-forms.mjs`, and a test checks every catalogue's
     formula against the CLDR rules for 0 to 2000. Six languages have no CLDR rules and are set by hand, with the reason.
   - **Words left in English** because they are the usual loanword (for instance "Layout" in Danish) are listed
     per catalogue in `sameAsEnglish`; no other string may be identical to the English.
   - The package is 312 KB with all the catalogues, up from 174 KB.
4. **Other-language runs** of `test:prefs` and `test:shell`; README language table and credits. Done.
5. **Track B pipeline. Done:** CLDR to a module per language, tested on small data and on the real data and table.
6. **Track B runtime. Done:** `fold`, the names on `Emoji`, the loader, the session, the extension, journeys with
   fixtures, and a real-Shell test (`test:shell`) in which French users type `chat`, German users `katze` and
   Spanish users `gato`, and find the cat.
7. **Compliance:** the Unicode licence is in the package; full mutation run, review pass and release notes still to do.

## Risks and open questions

- Quality in tier 3 will be uneven. A machine translation is better than nothing only if it is not wrong; the first
  review finding that a language is misleading removes it.
- The comparison in Phase 2 can show where two versions differ, not which a native speaker prefers.
- Changing the Dockerfile re-pins the image: it must go through the usual digest update.
- CLDR 49 is the data at the time of writing; Dependabot can propose newer releases after the one-week cooldown.
- Attribution wording for CLDR and for the human translators needs the maintainer's approval.
