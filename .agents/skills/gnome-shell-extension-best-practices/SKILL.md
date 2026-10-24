---
name: gnome-shell-extension-best-practices
description: Best practices for developing modern GNOME Shell extensions (GNOME 45+) in TypeScript (compiled to GJS ESM), covering ESM architecture, paired lifecycle management, memory leak prevention, GObject signal handling, native D-Bus IPC, and process separation.
---

# GNOME Shell Extension Best Practices

This skill guides development, refactoring, and code review for modern GNOME Shell extensions (GNOME 45+).
It embodies patterns from the official GJS documentation (`gjs.guide`), the extensions review guidelines,
and production practice.

> **Verify, don't recall.** APIs shift between Shell releases. Before relying on one for a version in
> `metadata.json` `shell-version`, confirm it with the `gnome-api-verifier` agent (upstream source at the
> release tag). Examples below use the long-stable GNOME 45+ API.

This project is **TypeScript** (`strict`), compiled with plain `tsc` to readable ES modules: no bundler, no
minifier, comments kept, so what reviewers read is what the source says. The examples below are valid
TypeScript once annotated; the extension is mid-migration from legacy JavaScript, which is why some
code in the repository does not follow this guide yet. Types for GNOME libraries come from `@girs/*`.

---

## 1. Modern ESM Architecture (GNOME 45+)

Modern extensions are native ECMAScript Modules with separate entry points for the Shell compositor and the
Preferences process.

### Entry Point Separation

- **Shell process (`extension.js`)** runs inside `gnome-shell`.
  - `export default class MyExtension extends Extension`, with `Extension` imported from
    `resource:///org/gnome/shell/extensions/extension.js`.
  - Allowed: `St`, `Clutter`, `Meta`, `Shell`, `Gio`, `GLib`, `GObject`, and `ui/*.js` Shell modules.
  - **Prohibited**: `Gtk`, `Gdk`, `Adw`. Importing GTK in the compositor causes symbol collisions and
    instability, and is an instant EGO rejection.
- **Preferences process (`prefs.js`)** runs in a separate GTK4 process (`gnome-extensions prefs <uuid>`).
  - `export default class MyPrefs extends ExtensionPreferences`, with `ExtensionPreferences` imported from
    `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`, implementing
    `fillPreferencesWindow(window)`.
  - Allowed: `Gtk`, `Gdk`, `Adw`, `Gio`, `GLib`, `GObject`.
  - **Prohibited**: `Clutter`, `Meta`, `St`, `Shell`.
- Code shared by both processes may import only what _both_ may import (`Gio`, `GLib`, `GObject`).
  Follow the import graph transitively when checking.

### Extension API you should use instead of globals

Inside the `Extension` subclass: `this.getSettings()` (uses `settings-schema` from `metadata.json`),
`this.path`, `this.metadata`, `this.uuid`, and the exported `gettext as _`,
`ngettext`, `pgettext`. Do **not** use `ExtensionUtils`, `imports.*` or `Me.imports` (removed in 45).

### Modular architecture over monoliths

Keep `extension.js` to lifecycle orchestration. Suggested layout for this project:

```
assets/
├── extension.js          # Extension subclass: enable()/disable() only
├── prefs.js              # ExtensionPreferences subclass
├── lib/                  # panel button, categories, search, buttons (no global state)
├── data/                 # emoji tables (data only)
├── schemas/  locale/  icons/  stylesheet.css  metadata.json
```

Pass dependencies (settings, clipboard, the owning extension) into constructors rather than importing
`extension.js` for shared mutable state. That also makes the code unit-testable with the mocks.

---

## 2. Paired Lifecycle Management & Leak Prevention

Extensions are enabled and disabled repeatedly in one session (screen lock, session-mode change,
toggling).

### The Golden Lifecycle Rule

1. **`constructor()`**: static configuration and immutable constants only. No GObjects, UI, signals,
   timers, or Shell access.
2. **`enable()`**: instantiate everything; attach UI; connect signals; add sources; add keybindings.
3. **`disable()`**: tear down everything `enable()` created. After `disable()` the desktop is identical to
   the state before `enable()`. Null out references so they can be garbage-collected.

### Paired setup and teardown

| In `enable()`                           | In `disable()`                   |
| :-------------------------------------- | :------------------------------- |
| `obj.connect('signal', cb)` → id        | `obj.disconnect(id)`             |
| `obj.connectObject('signal', cb, this)` | `obj.disconnectObject(this)`     |
| `GLib.timeout_add(...)` / `idle_add`    | `GLib.Source.remove(id)`         |
| `Main.panel.addToStatusArea(...)`       | `indicator.destroy()`            |
| `Main.wm.addKeybinding(...)`            | `Main.wm.removeKeybinding(name)` |
| `container.add_child(widget)`           | `widget.destroy()`               |
| `new InjectionManager()` + overrides    | `manager.clear()`                |
| `settings = this.getSettings()`         | `settings = null`                |

### Signal ID management

```js
// ❌ WRONG: handler id is lost, so it cannot be disconnected
this._settings.connect('changed::nbcols', () => this._rebuild());

// ✅ CORRECT: keep the id (or use connectObject) and disconnect on teardown
this._signalIds = [this._settings.connect('changed::nbcols', () => this._rebuild())];
// ...
this._signalIds.forEach((id) => this._settings.disconnect(id));
this._signalIds = [];
```

Every branch that adds something must have a matching removal, including conditional ones (for example a
keybinding that is only registered when a setting is on, and toggled while running).

### Main-loop timers & sources

Never rely on `GLib.SOURCE_REMOVE` for lifecycle safety. A pending timer fires against destroyed objects
after `disable()` unless it is removed:

```js
// ✅ Tracked source, cleared both when it fires and on teardown
this._focusSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
  this._focusSourceId = null;
  global.stage.set_key_focus(this._searchEntry);
  return GLib.SOURCE_REMOVE;
});
// disable():
if (this._focusSourceId) {
  GLib.Source.remove(this._focusSourceId);
  this._focusSourceId = null;
}
```

---

## 3. Native APIs vs CLI Subprocesses

Spawning CLI tools from an extension is slow, brittle, and discouraged by reviewers.

- **Never** run `gsettings`, `dconf`, `gnome-extensions`, or `bash -c`. Use `Gio.Settings`, the
  `org.gnome.Shell.Extensions` D-Bus interface, etc.
- Use `Gio.DBusProxy`/`Gio.DBus.session.call` for desktop services.
- If a binary is genuinely required, execute it directly with an argv array, never through a shell:

```js
const proc = new Gio.Subprocess({
  argv: ['external-tool', '--arg', userInput],
  flags: Gio.SubprocessFlags.STDOUT_PIPE,
});
proc.init(null);
```

This extension needs none of these: it should contain no subprocess, network, or file-access code.

---

## 4. Defensive Coding & Anti-Patterns

### Avoid redundant runtime type checks

In GNOME 45+, platform APIs guarantee the standard extension interfaces. Do not feature-detect core
methods that always exist.

### Clean error handling: no empty `catch`

```js
// ❌ silent swallow
try {
  GLib.Source.remove(this._id);
} catch (e) {}

// ✅ explicit state check
if (this._id) {
  GLib.Source.remove(this._id);
  this._id = null;
}
```

When you do catch, use `console.error(e)`/`logError(e, 'context')` so the stack trace survives.

### Desktop UI consistency

- Use standard symbolic icon names (`face-smile-symbolic`, `system-search-symbolic`) or bundle icons and
  load them with `Gio.icon_new_for_string(`${this.path}/icons/name.svg`)` as a `gicon`.
- **Log hygiene**: do not flood `journalctl /usr/bin/gnome-shell`; log only actionable errors or behind a
  debug flag. Never log clipboard contents.
- Validate values read from GSettings before using them as array indexes, sizes or inside `style`
  strings, since anything that can write dconf can set them.

---

## 5. Development Checklist for GNOME Shell Extensions

- [ ] Does `extension.js` import nothing from `Gtk`, `Gdk`, or `Adw` (transitively)?
- [ ] Does `prefs.js` import nothing from `Clutter`, `Meta`, `St`, or `Shell` (transitively)?
- [ ] Is `constructor()` side-effect free?
- [ ] Does `enable()` construct, and does `disable()` fully destroy, all widgets, signals, sources and
      keybindings, and null the references?
- [ ] Are all signal handler IDs tracked and disconnected in `disable()`?
- [ ] Are all `timeout_add`/`idle_add` sources tracked and removed in `disable()`?
- [ ] Is there no module-level mutable state that survives `disable()`/`enable()`?
- [ ] Are desktop interactions via GSettings/D-Bus rather than CLI subprocesses?
- [ ] Are there no `imports.*`, `ExtensionUtils`, `init()` or `buildPrefsWidget()` leftovers?
- [ ] Are user-visible strings wrapped in `_()`, with `%s`/`format()` not concatenation?
