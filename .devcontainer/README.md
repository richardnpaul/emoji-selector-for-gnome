# Dev container

Fedora 45 base, so the toolchain matches GNOME Shell **51.1** (GJS 1.90,
Mutter 51, Node 22). Includes `pre-commit`, `shexli` (pinned, see below),
`glib-compile-schemas`, gettext, Xvfb and `python3-dbusmock`.

## Notes

- **`shexli` pins `tree-sitter==0.25.0`.** 0.26.0 segfaults on Python 3.14+.
  `shexli` also exits 0 when it reports warnings, so scripts must parse its
  output rather than rely on the exit status.
- **Typelibs.** The Shell/Mutter libraries are not on the default search path;
  `GI_TYPELIB_PATH` and `LD_LIBRARY_PATH` are set in the image.
- **Running a real, headless Shell.** `npm run test:shell` does it for you, needing no root: it starts
  a private system bus with a fake logind (`tests/integration/real/run-shell.sh`). By hand, with the
  container's own system bus and a fake logind, then a private `XDG_RUNTIME_DIR`:

  ```sh
  sudo dbus-daemon --system --fork
  sudo python3 -m dbusmock --system --template logind &
  export XDG_RUNTIME_DIR="$(mktemp -d)"; chmod 700 "$XDG_RUNTIME_DIR"
  dbus-run-session -- gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720
  ```

  The Extensions API (`ListExtensions`, `EnableExtension`, ...) is the
  `org.gnome.Shell.Extensions` _interface_ on `org.gnome.Shell` at
  `/org/gnome/Shell`. The `org.gnome.Shell.Extensions` _bus name_ is the separate
  GTK prefs app, which needs a display.

- **`dev.containers.defaultFeatures` must not include `github-cli`.** Default
  features from VS Code user settings are injected into every dev container and
  cannot be switched off from `devcontainer.json` (setting them to `false` is
  ignored). `github-cli` only supports `apt-get`, so it fails the build on
  Fedora. `git` and `gh` are installed by the Dockerfile instead.
- **Translations of the Shell.** The base image installs only English, so the Dockerfile sets `%_install_langs` to the
  languages of the tests. This is not cosmetic: GLib translates nothing in a program that has its own text domain
  (the Shell's) when that domain has no catalogue for the locale, so without the Shell's translations an extension
  stays in English in a headless Shell.
- **Locales.** The image installs a few `glibc-langpack-*` packages so that the real gettext can be run as a user of
  that language would (`tests/integration/catalogues.tooling.test.js` checks the list). Other locales are not
  installed: `locale -a` shows what exists.
- No host display or X11 socket is forwarded; GTK code runs under `xvfb-run`.
- Rootless Podman users: add `--userns=keep-id` to `runArgs` in
  `devcontainer.json` so the bind mount stays writable.

## Claude Code

- Claude Code is installed from `claude-code/package-lock.json` (version in `claude-code/package.json`).
- **Its login, settings, sessions and memory live in a Docker named volume** (`claude-config-<id>`,
  mounted at `/home/vscode/.claude`), **not** in your host's `~/.claude`. Nothing from the host is
  mounted into the container apart from the workspace, so code running in the container (test runner,
  Stryker, ESLint and their plugins, an AI agent following injected instructions) cannot read your host
  credentials or change the host's `settings.json` hooks and skills.
- **First start: log in once inside the container** (run `claude`, or `claude auth login`). The login
  then survives rebuilds, because it is in the volume. Your host sessions and memory are not shared with
  the container. To start over: `docker volume rm claude-config-<id>` (list them with
  `docker volume ls`).
- `CLAUDE_CONFIG_DIR` points at the volume so `.claude.json` (trust and onboarding state) lives there too.
- The volume's mount point is created in the image, owned by the container user, so the volume starts out
  writable.
- Still shared with the host: the workspace itself, which is mounted read-write. Anything running in the
  container can therefore write `.git/hooks/`, which the host's git then runs. That is inherent to
  editing in a container; review hook changes (they do not appear in `git status`).
- Separate from this repository's configuration: VS Code's Dev Containers extension can forward your SSH
  agent and git credentials into any dev container (see its `dev.containers.*` settings).
- The container user has passwordless `sudo`, for installing packages while developing and for the
  headless-Shell recipe above. With no credentials mounted, that is contained to the container.

## What is pinned, and what is not

| What                                                                   | How                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Base image                                                             | `FROM fedora:45@sha256:…` (digest)                                                   |
| `pre-commit`, `shexli` and their dependencies                          | `requirements.txt`, with hashes, installed with `--require-hashes`                   |
| Build tools for packages built from source (Cython, setuptools, wheel) | `requirements-build.txt`, with hashes; the rest is built with `--no-build-isolation` |
| Claude Code                                                            | `claude-code/package-lock.json` (integrity hashes), installed with `npm ci`          |
| The project's own tooling                                              | `package-lock.json`, exact versions, `npm ci`                                        |
| Git hooks                                                              | each hook repository by commit SHA; `check-yaml`'s one dependency pinned             |
| GitHub Actions                                                         | commit SHAs; runner `ubuntu-24.04`; read-only token                                  |
| Updates                                                                | Dependabot, with a 7-day cooldown on new releases                                    |

**Not lockable:** the Fedora packages (`dnf` has no lockfile; they follow the Fedora 45 repositories at
build time, so the image can differ between builds even with the same digest), and the dependencies that
`pre-commit` installs for hooks other than `check-yaml` (it has no lockfile either). Claude Code is the one
npm install that runs lifecycle scripts, because its postinstall links the native binary.

To change a Python tool, edit `requirements.in`, then regenerate (needs [uv](https://docs.astral.sh/uv/)):

```sh
cd .devcontainer
uv pip compile --generate-hashes requirements.in -o requirements.txt
uv pip compile --generate-hashes requirements-build.in -o requirements-build.txt
```

To change Claude Code: edit `claude-code/package.json`, then `npm install --package-lock-only
--ignore-scripts` in that directory.
