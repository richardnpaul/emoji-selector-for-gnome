---
trigger: always_on
---

# Localisation (l10n) Rules

These rules govern localisation across all code, configuration, templates, and UI components in this repository.

## 1. Mandatory Localisation Skill Follow-Through

- Whenever working on features, UI components, notifications, user messages, documentation, or changes that touch user-facing content, you **MUST** follow the `localisation-l10n` skill (`.agents/skills/localisation-l10n/SKILL.md`).
- Adhere strictly to the principles, architectural patterns, and formatting guidelines defined in the `localisation-l10n` skill.

## 2. Zero Hardcoded Language Strings

- **NEVER** hardcode user-facing strings directly in production code, UI templates, or component logic.
- This includes, but is not limited to:
  - UI labels, button text, page headings, group titles, and status badges.
  - Entry placeholders, subtitle hints, validation messages, and tooltips.
  - Error messages, alerts, dialogue prompts, confirmation modals, and desktop notifications.
  - Accessibility labels (e.g., `accessible_name`, `accessible_description`).
  - Panel status menu items, toggle switch descriptions, and log messages presented to users.
- All user-facing strings **MUST** be wrapped in the gettext translation function `_("...")` and extracted into the gettext template ([`assets/locale/emoji-selector.pot`](../../assets/locale/emoji-selector.pot)) and language catalogs (`assets/locale/<lang>/LC_MESSAGES/emoji-selector.po`). Source files scanned by `xgettext` are listed in `POTFILES.in` and must be kept current.

## 3. String Interpolation and Dynamic Text

- **NEVER** use string concatenation or template literals (`"Hello " + name` or `` `Showing ${count} items` ``) to construct localized sentences or messages. Word order, grammar, and inflection vary across languages.
- You **MUST** use standard gettext format specifiers (e.g. `%s`) or `format()` helpers as supported by the GJS gettext framework.
- Any msgid containing format specifiers must preserve matching specifiers across all translation catalogs (enforced by `msgfmt -c`).
- Handle pluralisation with `ngettext(msgid, msgid_plural, n)` and context with `pgettext(context, msgid)`, never with hardcoded inline conditionals.

## 4. Regional and Cultural Conventions

- **Dates, Times, Numbers, and Currencies**: **NEVER** format dates, times, numbers, percentages, or currencies using manual string manipulation or fixed separators. You **MUST** use the standard `Intl` API (`Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`) respecting the active desktop locale.
- **Layout Adaptability**:
  - Design UI containers to accommodate 30–50% text expansion (e.g., German translations vs English). Avoid fixed-width controls that cause text clipping or ellipsis overflow; enable text wrapping (`wrap: true`) on labels.
  - In Libadwaita and GTK4, use logical widget positioning (`add_prefix` / `add_suffix`, start/end alignment) rather than physical left/right positioning to ensure native Right-to-Left (RTL) mirroring.

## 5. Verification and Testing

- When writing tests (in accordance with TDD rules), verify that:
  - User-facing strings pass through gettext `_()` rather than raw string literals.
  - All `.po` catalogs compile cleanly via `npm run build:locales` (`msgfmt -c -v` with 0 format errors).
  - Both LTR and RTL preferences render cleanly via `npm run test:prefs` and `npm run test:prefs:rtl`.
