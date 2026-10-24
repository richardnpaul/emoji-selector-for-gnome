---
name: localisation-l10n
description: Implement localisation (l10n) and internationalisation (i18n) best practices for GNOME Shell extensions, Libadwaita preferences, and GJS applications.
---

# Localisation (l10n) & Internationalisation (i18n) for GNOME Shell Extensions

You are an expert in localisation for GNOME Shell extensions, Libadwaita, GTK4, and GJS applications. Apply these guidelines to ensure the extension adapts seamlessly across desktop locales, scripts, and cultural conventions worldwide.

## Core Principles

- Localisation (l10n) builds upon internationalisation (i18n).
- **Zero hardcoded user-facing strings**: Wrap all UI copy, notifications, titles, descriptions, and error messages in gettext `_()`.
- **GNU gettext toolchain**: Extract strings to `.pot` template, manage `.po` regional catalogs, and compile to binary `.mo` files in `dist/locale/<lang>/LC_MESSAGES/`.
- **RTL & Logical Layouts**: Support bidirectional text and Right-To-Left (RTL) desktop layouts natively using Libadwaita prefix/suffix logical positioning.
- **Dynamic formatting**: Respect desktop locales for dates, times, and numbers via standard `Intl` APIs.

---

## Translation Toolchain & File Organisation

### Directory Structure

Catalogues live inside the extension directory so they ship with it:

```
assets/locale/
  emoji-selector.pot                          # Base gettext template (generated, committed)
  <lang>/LC_MESSAGES/emoji-selector.po        # Source catalogue per language (ar, cs, de, ...)
  <lang>/LC_MESSAGES/emoji-selector.mo        # Compiled catalogue (shipped in the zip)
POTFILES.in                                   # Lists the source files xgettext scans
```

The gettext domain is `emoji-selector` (`metadata.json` → `gettext-domain`). `.po` and `.pot` files are
excluded from the zip. Only `.mo` files ship.

### Build Commands

1. **Extract, merge and compile** (one script, `update-and-compile-translations.sh`):

   ```sh
   npm run build:locales
   ```

   It regenerates the `.pot` from `POTFILES.in` with `xgettext` (only when a message changed), runs
   `msgmerge --update` on each `.po` (changed messages become fuzzy, for translators to confirm), then
   `msgfmt --check` each into its `.mo`. It is tested (`tests/integration/scripts.tooling.test.js`) and must
   keep quoting every path, using `set -euo pipefail`, and never `rm` a computed path.

2. **Validate catalogue syntax** (also done by the script and by a pre-commit hook):
   ```sh
   msgfmt -c -v assets/locale/<lang>/LC_MESSAGES/emoji-selector.po
   ```
   Ensures syntax validity and format specifier matching.

---

## Coding Patterns in GJS

### 1. Simple String Translation

```js
// extension.js / lib/*.js (shell process)
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
// prefs.js (prefs process) imports it from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

// Never: const title = "Emoji Selector";
const title = _('Emoji Selector');
```

### 2. Format Specifiers and Parameterized Strings

Never concatenate strings or use template literals for translatable text:

```js
// BAD - word order is locked and breaks in non-English grammars:
const msg = _('Showing') + ' ' + count;
const msg = `Showing ${count} results`;

// GOOD - gettext format specifier preserved across all languages:
const msg = _('Showing %s results').format(count);
```

### 3. Plurals and Context

- Plural forms: Use `ngettext(msgid, msgid_plural, n)` to let gettext apply each language's plural rules.
- Context disambiguation: Use `pgettext(context, msgid)` when the same English word has distinct meanings depending on context (e.g., "General" settings vs military rank).

### 4. Locale-Aware Formatting (`Intl`)

```js
// Format numbers and timestamps respecting user desktop locale:
const formatTimestamp = (date) => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};
```

---

## Libadwaita & GTK4 UI Adaptability

### 1. Right-To-Left (RTL) Support

- **Logical Widget Positioning**: Use Libadwaita row helpers `add_prefix(widget)` and `add_suffix(widget)` instead of absolute left/right coordinates. Libadwaita automatically mirrors prefixes and suffixes in RTL locales (Arabic, Hebrew, Persian, Urdu, etc.).
- **Alignment**: Use `Gtk.Align.START` and `Gtk.Align.END` instead of hardcoded coordinates.
- **Label Wrapping**: Ensure `wrap: true` is configured on descriptions and subtitles to prevent container overflow with long translations.

### 2. Accommodating Text Expansion

- Languages such as German, French, and Finnish often expand English text by 30%–50%.
- Avoid fixed width request (`set_size_request(width, -1)`) on containers holding translatable labels.
- Allow natural sizing inside `Adw.PreferencesGroup` and `Adw.ActionRow`.

---

## Verification & Testing

1. **Format Validation**:
   - Every `.po` file must compile with zero errors via `msgfmt -c -v`.
   - Any message with `%s` must preserve `%s` in every translation.
2. **Headless Preferences Smoke Tests**:
   - Run LTR preferences test:
     ```sh
     npm run test:prefs
     ```
   - Run RTL preferences test:
     ```sh
     npm run test:prefs:rtl
     ```
3. **EGO Review Verification**:
   - Run `shexli` against the packaged zip to verify compliance with GNOME Extensions review guidelines.
