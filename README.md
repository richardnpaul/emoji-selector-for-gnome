# Emoji Selector (for GNOME Shell)

This GNOME shell extension provides a searchable popup menu displaying most emojis ; Clicking on an emoji copies it to your clipboard.

Supports **GNOME Shell 45 to 51**. (Older releases need the older versions of the extension.)

## Features

> **currently Unicode 11** ([soon 12](https://github.com/maoschanz/emoji-selector-for-gnome/issues/28))

- keyboard shortcut to open the extension's menu (<kbd>Super</kbd>+<kbd>.</kbd> by default, as in Windows)
- dynamic search (press <kbd>Enter</kbd> to copy the first result to the clipboard)
- lots of configurable things
- skin tone & gender modifiers
- middle-click to set to the clipboard without closing the menu (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>)
- right-click to add the emoji at the end of the current clipboard content (or <kbd>Shift</kbd>+<kbd>Enter</kbd>)

The keyboard navigation is designed to work **with <kbd>Tab</kbd>, not the arrows**.

![Screenshot](./screenshot_v19.png)

## About fonts

It will be less ugly if you have the « Noto Emoji » font, the
« [Twitter Color Emoji](https://github.com/eosrei/twemoji-color-font/releases) »
font, or the « JoyPixels Color » font installed on your system.

## About memory performance

Loading hundreds of small pictures and thousands of keywords into the memory is
a lot. Despite a few attempts to optimize their loading, I'm not an expert at
all concerning memory management, and the extension may be responsible for
between 10MB and 60MB of memory usage, which is a lot. Don't blame the actual GS
devs for it.

## Contributors & translations

Various contributions to the code itself:

- [Ryan Gonzalez](https://github.com/kirbyfan64)
- [amivaleo](https://github.com/amivaleo)
- [xurizaemon](https://github.com/xurizaemon)

The extension is currently available in the following languages:

- Arabic, Czech, French, Galician and Occitan (see the `.po` files for who)
- Castillan (thanks to mario-mra)
- Simplified chinese (thanks to larryw3i)
- Dutch (thanks to vistaus)
- Esperanto (thanks to nicolasmaia)
- German (thanks to jonnius)
- Italian (thanks to amivaleo)
- Polish (thanks to alex4401)
- Brazilian portuguese (thanks to nicolasmaia, picsi & frnogueira)

If you need another language, please contribute!

---

## Installation

#### Default way to do

The better option is to install it from [here](https://extensions.gnome.org/extension/1162/emoji-selector/).

#### Native packages

- [`gnome-shell-extension-emoji-selector` (**Fedora**)](https://src.fedoraproject.org/rpms/gnome-shell-extension-emoji-selector)
- `gnome-shell-emoji-selector` (**nixOS**)
- [`gnome-shell-extension-emoji-selector-git` (**AUR**)](https://aur.archlinux.org/packages/gnome-shell-extension-emoji-selector-git/)

#### Manual installation

**Not recommended at all:** installing the extension this way prevent any
further update.

Download and extract the sources, then open a terminal in the project's directory,
and run `npm ci && npm run build:ts && ./install.sh` (the extension is written in
TypeScript, which Node.js compiles). `install.sh` builds the extension exactly as it
is uploaded to extensions.gnome.org and installs it in
`~/.local/share/gnome-shell/extensions/` (`./install.sh --system`, run as root,
installs it for every user instead). Needs `zip`, `unzip` and `glib-compile-schemas`.

You may need to restart the GNOME Shell environment (logout and login again, or
<kbd>Alt</kbd>+<kbd>F2</kbd> -> `r` ->, <kbd>Enter</kbd>).

---

## Development

Open the project in the dev container (`.devcontainer/`): it has GNOME Shell,
GJS, Node and every tool below. Then:

```sh
npm install                 # dependencies (lifecycle scripts are disabled on purpose, see .npmrc)
npm test                    # unit + integration tests          (also test:unit, test:integration)
npm run test:coverage       # the same, failing below 100% coverage
npm run typecheck           # TypeScript, strict
npm run test:mutation       # Stryker mutation tests (about 6 minutes), 100% required
npm run test:prefs          # the preferences in the real GTK 4 and libadwaita, under Xvfb (also test:prefs:rtl)
npm run test:shell          # the built extension in a real, headless GNOME Shell, driven like a user would
npm run lint                # ESLint, zero warnings allowed
npm run format:check        # Prettier              (npm run format fixes)
npm run check               # lint + format:check + test:coverage
npm run shexli              # build the zip and run the extensions.gnome.org review linter
npm run build:ts            # compile src/ to dist/emoji-selector@maestroschan.fr/
npm run build:package       # build:ts, then dist/emoji-selector@maestroschan.fr.zip (only the files that ship)
npm run build:locales       # extract strings, update every .po, compile the .mo files
```

`EXTENSIONS_DIR=/some/absolute/dir ./install.sh` installs somewhere else than
`~/.local/share/gnome-shell/extensions`; `build-a-zip.sh` (run `npm run build:ts` first)
also needs `find`, `sed`, `sort`, `cp` and `xargs`.

**Layout.** `src/` is the TypeScript source (`extension.ts` and `prefs.ts`, the modules in
`lib/`, the emoji tables in `data/`); `emoji-selector@maestroschan.fr/` keeps what is not code
(metadata, GSettings schema, stylesheet, icons, translations).

**Git hooks.** The dev container installs them. Anywhere else, run
`pre-commit install --install-hooks` once (`npm install` does not). Every
commit then runs the checks (whitespace, JSON/XML/YAML, ShellCheck, shfmt,
codespell, ESLint, Prettier, the GSettings schema, the translation catalogues,
and a guard against skipped tests or suppressed lint/coverage/mutation checks),
and every push runs the tests with the coverage thresholds.
`pre-commit run --all-files` runs them on demand.

**CI** (`.github/workflows/ci.yml`) runs the same gates in the dev container image on every
push to `main` and every pull request, so `--no-verify` or a contributor outside the dev
container cannot bypass them: all hooks plus `npm run check`; the mutation tests; the
extensions.gnome.org review (shexli); and the tests in the real preferences and the real Shell.

**Everything is pinned**: GitHub Actions by commit SHA, the container base image by digest,
Python tools by hash, npm packages by lockfile, git hooks by commit SHA. Dependabot proposes
updates (a week after release). `.devcontainer/README.md` lists what is and is not lockable.
See `tests/README.md` for how the tests work, and `AGENTS.md` for the rules AI coding agents
follow here.
