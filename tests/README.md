# Tests

```sh
npm test                          # everything (unit + integration), ~20 s
npm run test:unit                 # tests/unit
npm run test:integration          # tests/integration
npm run test:coverage             # + V8 coverage, fails below 100% (statements/branches/functions/lines)
npm run test:mutation             # Stryker, fails below 100% mutation score (~6 min)
npm run test:mutation:incremental # opt-in cache; re-run without it before trusting a result
npm run test:prefs                # the preferences in the real GTK 4 + libadwaita under Xvfb (test:prefs:rtl: right-to-left only)
npm run test:shell                # the built extension in a real, headless GNOME Shell 51
UPDATE_GOLDEN=1 npm run test:unit # regenerate tests/fixtures/emoji-data.json (then review the diff)
```

Run them in the devcontainer: the tooling tests need `glib-compile-schemas`, `msgfmt`, `msgcat`, `xgettext`,
`gjs`, `xvfb-run`, `dbus-daemon`, `python3-dbusmock` and `gnome-shell`. A missing tool fails the test; it never skips.

## Current status

| Gate             | Result                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests            | 500 passing (21 files, `test:prefs` and `test:shell` included)                                                                                          |
| Coverage         | 100% statements, branches, functions, lines (`src/` and `scripts/`)                                                                                     |
| Mutation score   | **100.00%**: 7,722 mutants (about 6,750 in the emoji tables, killed by the golden file; about 970 in the logic), 0 survived, 0 timed out, 0 no-coverage |
| Lint / format    | ESLint 0 warnings (strict type-aware TypeScript), Prettier clean, all pre-commit hooks pass                                                             |
| `npm run shexli` | no findings, apart from two reviewed ones (`scripts/lib/shexli-accepted.mjs`)                                                                           |

## How the code is tested

The sources are TypeScript ES modules that import GNOME by URL (`gi://St`, `resource:///org/gnome/shell/…`).
`vitest.config.mjs` aliases every such specifier to a fake under `support/` (`support/gi/*.js`,
`support/shell/**`, `support/prefs/prefs.js`), so the real modules run unchanged on Node, with native V8
coverage, and Stryker can mutate them. Each module takes what it needs as arguments (its settings, the
clipboard, the host that opens categories), so a test builds one with a few fakes. There is no module-level state.

### Why you can trust the fakes

A fake that is more lenient than GNOME makes tests pass while the real extension fails. That happened
(defect 15 below; and libadwaita reading `<Super>` as markup, found only by the real-GTK test), so fidelity is
tested, not assumed:

| Fake                     | Fidelity                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API names and constants  | `real-tools.tooling.test.js` loads the **real Clutter/St/Meta/Shell/GLib typelibs** in GJS and checks that (1) every `Clutter.*`/`St.*`/`Meta.*`/`Shell.*`/`GLib.*` name the Shell-side sources use exists, (2) the fakes' constants have the real values, (3) the fakes define no constant the real library lacks.          |
| Types                    | `npm run typecheck` checks the sources against the generated `@girs/*` declarations of GNOME Shell 50 (strict, `noUncheckedIndexedAccess`), which would have caught the invented `Clutter.KP_Enter` of the old code.                                                                                                         |
| `Gio.Settings`           | Keys, types and defaults are **parsed from the real `gschema.xml`**, and ranges and choices are enforced as real GSettings does (a refused write returns false and emits nothing; writing the value a key already holds emits nothing, as probed against the real library). `bind` follows the object until it is destroyed. |
| Adw / Gtk                | `prefs-real.tooling.test.js` builds and installs the package, opens the **real preferences in real libadwaita** (with the Extensions app's own prefs module) and drives the real widgets; its expectations mirror `unit/prefs.test.js`, which runs the same scenarios on `support/fakes/adw.js`.                             |
| `GLib` main loop         | Source ids are tracked. `remove()` of a string throws, and of an unknown id or `null` counts as a GLib _critical_ that tests assert is zero. A timeout callback that returns nothing is removed, as in GJS.                                                                                                                  |
| `St.Clipboard`           | Separate buffers per `St.ClipboardType`, a read snapshot taken when asked, and a log of every read and write, so tests prove which buffer is used and that nothing touches the clipboard unprompted. `test:shell` copies with a real click.                                                                                  |
| St / Clutter / PopupMenu | Parenting, destruction, signal ids, `connect`/`disconnect` pairing, and `PopupMenu.destroy()` closing the menu first, as the Shell source does. A registry of every actor lets tests prove none outlives `disable()`; `test:shell` checks the same in the real stage.                                                        |
| `gettext`                | A pseudo-locale (`«…»`) proves strings go through the extension's catalogue.                                                                                                                                                                                                                                                 |

Only the Shell 51 libraries exist in the container, so **GNOME Shell 45 to 50 are verified by reading their
sources** (js/ui, js/extensions, St and libadwaita docs of each release), not by running them. The code uses
one API surface for all seven (no per-version branches were needed).

## Layout

```
tests/
  support/        fakes (toolkit, settings, adw), gi/ and shell/ aliases, real-package.js (build + install)
  fixtures/       emoji-data.json, the reviewed golden copy of the emoji tables
  unit/           one file per module (emoji, emojiButton, emojiCategory, emojiSearchItem, emojiMenu,
                  skinTonesBar, clipboard, catalogue, settings, extension, prefs, the emoji data) and the
                  scripts/lib helpers (shexli)
  integration/
    journeys.test.js                  the real extension on the fake runtime, through the actors a user
                                      sees: search → copy, recents-first (#119, also for toned emoji), skin
                                      tone / gender, hover, no unprompted clipboard use, every actor
                                      destroyed, repeated enable/disable, restart
    source-contract.tooling.test.js   no code to spawn, eval, use the network, touch files or D-Bus; the
                                      clipboard module is the only one that touches the clipboard; code ⇄ schema
                                      key agreement
    real-tools.tooling.test.js        real glib-compile-schemas, msgfmt (all catalogues), shipped .mo == .po,
                                      template matches the sources, real API names and constants, icons,
                                      stylesheet classes, no binaries
    scripts.tooling.test.js           build-a-zip.sh, install.sh and update-and-compile-translations.sh run
                                      for real in a sandbox copy (paths with spaces, missing tools, invalid
                                      input, concurrent installs, idempotence), plus the safe-shell rules
    project-rules.tooling.test.js     the docs only name npm scripts that exist; the 100% thresholds and the
                                      mutate/coverage scope cannot be weakened quietly; the package supports
                                      Shell 45-51 and compiles to exactly what is shipped; everything is
                                      locked (actions by SHA, image digest, hashes, lockfiles, hook SHAs)
    prefs-real.tooling.test.js        (test:prefs) the installed preferences in real libadwaita, LTR and RTL
    shell-real.tooling.test.js        (test:shell) the installed extension in a headless Shell 51
    real/                             GJS scripts run by the tests above: API inspection, the preferences
                                      harness, run-shell.sh (private system bus + fake logind, no root) and
                                      shell-driver/, a test-only extension that types and clicks with virtual
                                      input devices inside the Shell and reports what it sees
```

Tests named `*.tooling.test.js` read the sources as text or run external tools. They are excluded from
mutation testing automatically (`vitest.stryker.config.mjs`), because Stryker instruments the sources and
these tests cannot kill mutants anyway.

Quirks of the real Shell that the driver works around: the first events of a new virtual pointer or keyboard
are lost (it moves twice and retries the shortcut), and without the extension's shortcut Super+period opens
the overview.

## Mutation testing

`stryker.config.json` mutates **everything** under `src/` (logic and data) and `scripts/` with
`coverageAnalysis: perTest`, `thresholds.break: 100` and a 60 s per-mutant limit. `incremental` is
deliberately off by default: the fakes in `support/` are not tracked by Stryker's incremental diff, so editing
a fake could leave a stale 100%.

**The emoji tables** are most of the mutants. They are killed by `unit/data.test.js`, which compares every
emoji, name and keyword with `fixtures/emoji-data.json`, one emoji per line. That makes any change to the
tables an explicit, reviewable fixture diff. The same file pins the invariants the code relies on (equal
lengths, no duplicates, lower-case keywords, no stray whitespace, valid tone/gender markers).

No `// Stryker disable`, coverage-ignore comment, `skip`, or threshold change was used. Every equivalent
mutant was removed by simplifying the production code (for example, a union of strings became two booleans
because the `else` arm made a mutated string equivalent; a lookup became a loop).

## Defects found while characterising the code

### Fixed, test first (RED → GREEN), in the old code before the rewrite

| #   | Defect                                                                                                                                                                                   | Where                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Appending to an empty clipboard produced `"null😀"`                                                                                                                                      | `emojiButton.addToClipboardAndStay`     |
| 2   | Enter with nothing selected threw `TypeError`                                                                                                                                            | `emojiButton.onKeyPress`                |
| 3   | **Every search threw**: PR #120 changed `searchEmoji`'s signature but not its caller. Restored, and implemented the PR's intent (issue #119: recently used matches first, no duplicates) | `emojiSearchItem._getResults`           |
| 4   | Search returned one result too many per category (`>= 0` off-by-one)                                                                                                                     | `emojiCategory.searchEmoji`             |
| 5   | Changing the emoji size while running threw for any category never opened                                                                                                                | `emojiCategory.updateStyle`             |
| 6   | `shiftFor` skipped adjacent duplicates (`splice` in a forward loop)                                                                                                                      | `emojiSearchItem.shiftFor`              |
| 7   | Changing the column count swapped in a **detached** search item: search was dead until reload                                                                                            | `extension.updateNbCols`                |
| 8   | The `changed::nbcols` handler was never disconnected (shexli EGO-L-003)                                                                                                                  | `extension.disable`                     |
| 9   | Focus timer id overwritten and leaked; a menu closed again still had focus stolen                                                                                                        | `extension._onOpenStateChanged`         |
| 10  | `disable()` kept `GLOBAL_BUTTON`/`SETTINGS` alive (EGO-L-005)                                                                                                                            | `extension.disable`                     |
| 11  | Preferences switches initialised with `set_state` (real GTK4: `active` stays false), so they did not show the stored setting and the first click did nothing                             | `prefs`                                 |
| 12  | Clearing the shortcut list called `entry.set_text(undefined)` (throws in real GTK4)                                                                                                      | `prefs`                                 |
| 13  | "Always show" stayed adjustable while the shortcut was off, so the icon could be hidden with no way to open the menu                                                                     | `prefs`                                 |
| 14  | Trailing whitespace in two emoji names made exact-name search miss them                                                                                                                  | `data/emojisKeywords.js`                |
| 15  | **Numpad Enter did nothing on a real Shell**: the code used `Clutter.KP_Enter`, which does not exist (it is `KEY_KP_Enter`); the test fake had invented the name                         | `emojiButton.onKeyPress`                |
| 16  | 36 skin-tone buttons were built and never shown or destroyed (every category made a tone bar, only 3 attach one)                                                                         | `emojiCategory`                         |
| 17  | The recent-emoji row was built twice; the first was orphaned                                                                                                                             | `extension` / `emojiSearchItem`         |
| 18  | Disabling the extension mid-search **overwrote the stored recently used list with the search results**                                                                                   | `extension.disable`                     |
| 19  | #119 never applied to emoji used with a skin tone or gender (what is stored is `👉🏽`, the search compared `👉`)                                                                           | `emojiButton.isUsedAs`, `emojiCategory` |
| 20  | The "default shortcut" text said `<Super>e`; the real default (and, as on Windows, the intended one) is `<Super>period`. Schema descriptions and README corrected                        | `prefs`, schema, README                 |
| 21  | The category error messages used the Shell's global `_` (the Shell's own catalogue), so were never translated                                                                            | `emojiCategory`                         |
| 22  | The translation template and 13 catalogues did not contain the reworded About text, so it was untranslated everywhere. Regenerated; the string is marked fuzzy for translators           | `locale/`                               |

Dead code removed instead of tested: `EmojiCategory.clear()`, `_connectSignals`/`disconnectSignals`, unused imports and
variables, the `realize` handler in `buildPrefsWidget` (all its branches were unreachable), and the comparison with the
removed `Clutter.Return`. In the rewrite, the `destroy()` methods of the buttons, categories and search item went too:
the panel button owns them all, and destroying it cascades.

### Findings of the first audit, resolved by the TypeScript rewrite

| #   | Finding                                                                                                                        | Resolution                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| a   | `init()` used Gtk inside the Shell process (EGO rule 6) and silently failed on GTK4 shells, so icons might not resolve         | Icons are `Gio` icons built from the extension's path; ESLint forbids Gtk/Gdk/Adw imports there                                     |
| b   | Legacy `imports.*`, `ExtensionUtils`, `init/enable/disable`, `buildPrefsWidget` cannot load on GNOME 45+                       | ES modules with the `Extension` and `ExtensionPreferences` base classes                                                             |
| c   | `metadata.json` had a forbidden `version` key and listed only shell 40-43                                                      | No `version`; `shell-version` is 45 to 51                                                                                           |
| d   | `" emojis"` / `" keyword groups"` in the data-error lines were not translatable                                                | The tables are validated when the catalogue is built, which throws; no user-visible strings                                         |
| e   | Unvalidated settings: an out-of-range `skin-tone`/`gender` threw; another `position` built a menu without its header           | The schema declares ranges and choices; the code tolerates unknown values anyway                                                    |
| f   | Changing the column count live left the search row at its old width until reload                                               | The menu is rebuilt when `nbcols` or `position` change                                                                              |
| g   | A click with a mouse button other than 1-3 counted the emoji as used without copying it                                        | Use is recorded when the emoji is copied, and only then                                                                             |
| h   | Module-level mutable state and an `extension` ↔ `emoji*` import cycle                                                          | Dependency injection (`EmojiContext`, `CategoryHost`, `SearchScope`); a `Session` owns what is enabled                              |
| i   | The three shell scripts were unsafe and untested                                                                               | Rewritten test-first (step 4)                                                                                                       |
| j   | Magic numbers shared by convention, a font-style string built in three places, reaching into private members of another module | Category pickers are data, `emojiStyle()` builds the style once; the one private member left (`_triangleBin`) is guarded and tested |
| k   | The `~/.claude` bind mount was a container-to-host path; the toolchain was not locked                                          | Named volume; everything locked except what `dnf` and pre-commit hook dependencies cannot lock                                      |
| l   | No CI                                                                                                                          | `.github/workflows/ci.yml`, every action pinned by SHA                                                                              |
| m   | `typecheck`, `test:prefs`, `test:prefs:rtl` and `test:shell` were planned                                                      | They exist and run in CI                                                                                                            |

### Found while writing the new code

| #   | Defect                                                                                                                                                                                                                 | Found by                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 23  | libadwaita reads row titles and group descriptions as Pango markup, so the shortcut help (`<Super>period`) was an invalid-markup warning and showed nothing. Rows use `use_markup: false` and descriptions are escaped | `test:prefs` (the fakes could not) |
| 24  | The shortcut entry accepted modifiers alone (`<Super>`), which GTK parses as valid with key 0                                                                                                                          | `test:prefs`                       |
| 25  | Unknown combo selection (`GTK_INVALID_LIST_POSITION`) wrote `top` to the settings                                                                                                                                      | mutation testing                   |
| 26  | Toggling the shortcut off and on again with a menu rebuild between: the shortcut must be re-bound exactly once, and unbound only when bound                                                                            | `test:shell`, mutation testing     |

## What is not covered

- GNOME Shell 45 to 50 are not run, only read (see above). Newer or older libadwaita than the container's 1.9 is
  not run either; the code only uses what libadwaita 1.4 (GNOME 45) has.
- Behaviour of the scripts when killed by SIGKILL (temporary files can leak); other interruptions are covered by setting each cleanup trap first.
