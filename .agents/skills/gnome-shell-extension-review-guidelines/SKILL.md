---
name: gnome-shell-extension-review-guidelines
description: Compliance validation and review guidelines for extensions.gnome.org (EGO), covering mandatory submission rules, shexli linter checks, metadata.json specification, GSettings schemas, and privacy/security constraints.
---

# GNOME Shell Extension Review Guidelines (EGO Compliance)

This skill guides compliance audits, pre-submission checks, and reviews for extensions intended for distribution on [extensions.gnome.org (EGO)](https://extensions.gnome.org). Every extension submitted to EGO is reviewed by the GNOME Shell review team for security, stability, resource hygiene, and platform conventions.

---

## 1. Mandatory Review Rules

Every submission **MUST** pass all of the following rules without exception. Violations result in automatic rejection during the EGO review queue.

### Rule 1: Static Initialization Only

- Extensions **MUST NOT** create UI widgets, connect signals, add mainloop sources, or modify GNOME Shell during initialization or inside the `Extension` constructor.
- The `constructor()` must only create immutable data structures or static built-in JavaScript instances (`Map`, `Set`, `RegExp`).
- GObject instantiation (such as `Gio.Settings` or `St.Widget`) inside the constructor is strictly disallowed.

### Rule 2: Complete Widget & Object Destruction

- Every object, actor, or widget added to the Shell UI (`Main.panel`, `Main.uiGroup`, etc.) **MUST** be destroyed in `disable()`.
- Example:

  ```javascript
  disable() {
    this._button?.destroy();
    this._button = null;
  }
  ```

### Rule 3: Complete Signal Disconnection

- Any signal connection made by the extension (`GObject.connect()`, `Settings.connect()`) **MUST** be disconnected in `disable()`.
- Unmanaged signal connections keep garbage collection references alive and fire against dead instances.

### Rule 4: Complete Mainloop Source Removal

- Any source created via `GLib.timeout_add()`, `GLib.idle_add()`, or `setTimeout()` **MUST** be removed in `disable()`.
- Do not rely on callback functions returning `GLib.SOURCE_REMOVE` for lifecycle safety.

### Rule 5: Zero Deprecated Modules

- Extensions **MUST NOT** import deprecated legacy modules:
  - ❌ `imports.byteArray` - Use standard web `TextEncoder` and `TextDecoder`.
  - ❌ `imports.lang` - Use native ES6 classes and `Function.prototype.bind()`.
  - ❌ `imports.mainloop` - Use `GLib.timeout_add()`, `GLib.idle_add()`, or standard timers.

### Rule 6: Process Library Isolation

- Extensions **MUST NOT** import GTK (`Gtk`, `Gdk`, `Adw`) in the GNOME Shell compositor process (`extension.js`).
- Extensions **MUST NOT** import Shell libraries (`Clutter`, `Meta`, `St`, `Shell`) in the Preferences process (`prefs.js`).

### Rule 7: Code Must Not Be Obfuscated or Minified

- Submitted extension code **MUST** be readable and reviewable JavaScript.
- JavaScript code **MUST NOT** be minified or obfuscated.
- This project is written in TypeScript and compiled with plain `tsc` (no bundler, no minifier, comments kept), so the output stays readable. The public source repository (`url` in `metadata.json`) must contain the TypeScript source and the exact build command.

### Rule 8: No Excessive Logging

- Extensions **MUST NOT** print excessively to the system journal (`log()`, `console.log()`).
- Logging should be reserved for actionable errors or controllable debug flags.

### Rule 9: No Forced GObject Disposal

- Extensions **SHOULD NOT** call `GObject.Object.run_dispose()`. If unavoidable, an explicit code comment explaining the necessity is mandatory.

### Rule 10: Scripts and Binaries

- Extensions **MUST NOT** bundle compiled binary executables or shared libraries (`.so`).
- External scripts must be written in GJS under an OSI-approved license unless functionality is strictly unavailable in GJS.
- Privileged subprocess execution (`pkexec`) is strongly discouraged; if used, the executable must not be user-writable.

---

## 2. Metadata Specification (`metadata.json`)

The `metadata.json` file in the root of the extension bundle must be strictly formatted without superfluous or unrecognized keys:

| Field             | Requirement                                                                                                                   |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `name`            | Descriptive, unique name. Forks must have distinct names.                                                                     |
| `uuid`            | Must match `<id>@<namespace>`. Namespace cannot be `gnome.org`. Examples: `my-ext@john.github.io`.                            |
| `description`     | Clear explanation of functionality. Plain text or paragraphs separated by `\n`.                                               |
| `shell-version`   | Array of supported stable GNOME Shell versions (e.g. `["45", "46", "47", "48"]`). Must not claim speculative future versions. |
| `url`             | Link to public source repository (GitHub, GitLab) for issue reporting.                                                        |
| `settings-schema` | _(Optional)_ The ID of the GSettings schema if bundled.                                                                       |
| `gettext-domain`  | _(Optional)_ The gettext translation domain if localised.                                                                     |
| `session-modes`   | _(Optional)_ Drop if using default `user` mode. Only valid values are `user` and `unlock-dialog`.                             |
| `donations`       | _(Optional)_ Supported donation keys only (`github`, `gitlab`, `patreon`, `buymeacoffee`, `kofi`, `paypal`, `liberapay`).     |

> [!IMPORTANT]
> The `version` field is deprecated and managed automatically by `extensions.gnome.org`. Do not hardcode or increment it for EGO review.

---

## 3. GSettings Schema Rules

When bundling a GSettings schema:

1. **Schema ID**: Must start with `org.gnome.shell.extensions.` (e.g., `org.gnome.shell.extensions.my-ext`).
2. **Path**: Must start with `/org/gnome/shell/extensions/` (e.g., `/org/gnome/shell/extensions/my-ext/`).
3. **XML File**: Named `<schema-id>.gschema.xml` and included in `schemas/`.
4. **Compiled Cache**: `gschemas.compiled` must be included in development/testing, but **must be excluded** from the final distributed ZIP bundle if `glib-compile-schemas` is run on install.

---

## 4. Privacy, Security & Licensing

- **Zero Telemetry**: Extensions **MUST NOT** include any analytics, tracking scripts, or telemetry pings.
- **Clipboard Access**: If the extension reads or modifies the clipboard, it **MUST** declare this in `metadata.json`'s description and require explicit user action (button click or user-configured shortcut).
- **Licensing**: GNOME Shell is licensed under `GPL-2.0-or-later`. Derived extension code must be distributed under compatible terms (GPL-2.0-or-later, GPL-3.0-or-later). Code borrowed from other extensions must preserve copyright and license attribution.
- **Trademarks & Copyrights**: Extensions must not use trademarked brand logos or assets without authorization.

---

## 5. Automated Pre-Submission Validation Checklist

Execute these checks before submitting any extension bundle to EGO:

### Step 1: Run `shexli` (Official GNOME Extensions Review Linter)

```bash
shexli --format json /absolute/path/to/dist/<uuid>.zip
```

`shexli` validates bundle structure, manifest schema, forbidden library imports, and common review pitfalls. Submissions must produce **0 errors and 0 warnings**.

> **Pitfalls (shexli 0.2.1):** it **exits 0 even when it reports warnings**, so parse its output (the `issues_found (N findings, E errors, W warnings)` summary or the JSON) rather than the exit status; and pass an **absolute** path, because a relative directory path crashes with a `ValueError`.

### Step 2: Headless Preferences Smoke Tests

Verify that the preferences dialog loads cleanly in both Left-to-Right (LTR) and Right-to-Left (RTL) locales:

```bash
npm run test:prefs        # xvfb-run + gjs: loads prefs.js for real (LTR)
npm run test:prefs:rtl    # same, with an RTL locale
```

### Step 3: Bundle Content Hygiene

Ensure the final zip contains only production assets:

- ✅ Included: `metadata.json`, `extension.js`, `prefs.js`, `schemas/`, `locale/`, `icons/`
- ✅ Also included: `stylesheet.css`, `data/`, `prefs.ui` if still used, and compiled `locale/**/*.mo`
- ❌ Excluded: `node_modules/`, `tests/`, `scripts/`, `.git/`, `.github/`, `.agents/`, `.claude/`, `.devcontainer/`, `package.json`, `*.po`, `*.pot`, `schemas/gschemas.compiled`, build scripts, screenshots
