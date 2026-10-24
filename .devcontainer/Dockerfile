# Fedora 45 ships GNOME Shell 51, the newest release this extension targets, so
# the real typelibs (St, Clutter, Meta, Shell), GJS and a headless Mutter are
# all available for integration tests. The base image is pinned by digest (the
# tag is only a label for humans): to move to a newer Fedora 45 build or to
# Fedora 44 (GNOME 50), change both, e.g. with `docker buildx imagetools inspect`.
FROM fedora:45@sha256:aacbc26b38361ba0cb3d10f268da40b61b36aed6ed6fe5831a35871636bedb06

ARG CONTAINER_USER=vscode
ARG USER_UID=1000
ARG USER_GID=1000

# The base image installs only the English translations of its packages (%_install_langs). A real desktop has the
# others, and that matters: GLib refuses to translate anything in a program that has set its own text domain, as
# the Shell has, when that domain has no catalogue for the user's language. Without the Shell's own translations an
# extension would never be translated here. So install them for the languages that the tests run in
# (tests/integration/catalogues.tooling.test.js checks that these cover its users).
RUN echo '%_install_langs en_US:ar:de:es:fr:he:ja:pt:pt_BR:zh_CN:zh_TW:zh_HK' > /etc/rpm/macros.image-language-conf

# gnome-shell/mutter: nested headless compositor + the Shell typelibs
# gjs/gtk4/libadwaita: run prefs.js for real (under Xvfb)
# glib2-devel: glib-compile-schemas; gettext: xgettext/msgmerge/msgfmt
# mesa-*: software rendering so headless Mutter works without a GPU
# xorg-x11-server-Xvfb/dbus-*: headless Gtk and private session buses
# python3-dbusmock: fake logind/upower etc. on the system bus for a headless Shell
# glibc-langpack-*: real locales, so that tests can run the real gettext as a user of that language would
# (tests/integration/catalogues.tooling.test.js, which checks this list)
# gcc/python3-devel: PyYAML and tree-sitter have no wheel for this Python and are built from source
# (These system packages follow the Fedora repositories at build time: dnf has no lockfile.)
RUN dnf -y --setopt=install_weak_deps=False install \
        bash-completion \
        dbus-daemon \
        dbus-x11 \
        gcc \
        gettext \
        gh \
        git \
        gjs \
        glib2-devel \
        glibc-langpack-ar \
        glibc-langpack-de \
        glibc-langpack-es \
        glibc-langpack-fr \
        glibc-langpack-he \
        glibc-langpack-ja \
        glibc-langpack-pt \
        glibc-langpack-zh \
        gnome-shell \
        gtk4 \
        jq \
        libadwaita \
        mesa-dri-drivers \
        mesa-libEGL \
        mesa-libgbm \
        mutter \
        nodejs \
        npm \
        procps-ng \
        python3-dbusmock \
        python3-devel \
        python3-pip \
        sudo \
        unzip \
        which \
        xorg-x11-server-Xvfb \
        xz \
        zip \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# Python tools (pre-commit, shexli), from the hashed lockfiles generated from requirements*.in.
# Packages without a wheel for this Python are built from source, so their build tools are
# locked too: installed first, then everything is built without build isolation, which would
# otherwise download unpinned build tools.
COPY requirements.txt requirements-build.txt /tmp/python-tools/
RUN python3 -m venv /opt/python-tools \
    && /opt/python-tools/bin/pip install --no-cache-dir --require-hashes -r /tmp/python-tools/requirements-build.txt \
    && /opt/python-tools/bin/pip install --no-cache-dir --require-hashes --no-build-isolation -r /tmp/python-tools/requirements.txt \
    && ln -s /opt/python-tools/bin/pre-commit /usr/local/bin/pre-commit \
    && ln -s /opt/python-tools/bin/shexli /usr/local/bin/shexli \
    && rm -rf /tmp/python-tools

RUN groupadd --gid "${USER_GID}" "${CONTAINER_USER}" \
    && useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /bin/bash "${CONTAINER_USER}" \
    && echo "${CONTAINER_USER} ALL=(root) NOPASSWD:ALL" > "/etc/sudoers.d/${CONTAINER_USER}" \
    && chmod 0440 "/etc/sudoers.d/${CONTAINER_USER}"

# Mount point of the named volume that holds Claude Code's login and settings (see
# devcontainer.json). A new volume copies the ownership of this directory, so it must belong to
# the container user. Nothing from the host's ~/.claude is ever mounted.
RUN install -d -o "${CONTAINER_USER}" -g "${USER_GID}" -m 0700 "/home/${CONTAINER_USER}/.claude"

USER ${CONTAINER_USER}
ENV PATH="/home/${CONTAINER_USER}/.local/bin:${PATH}" \
    GI_TYPELIB_PATH="/usr/lib64/gnome-shell:/usr/lib64/mutter-51" \
    LD_LIBRARY_PATH="/usr/lib64/gnome-shell:/usr/lib64/mutter-51" \
    LANG="C.UTF-8"

# Claude Code, from its lockfile (claude-code/package-lock.json, integrity hashes for every package).
# claude-code is the one npm package in this repository installed with lifecycle scripts: its postinstall
# links the native binary, and `claude` refuses to start without it. Everything else uses
# ignore-scripts (see the repository's .npmrc).
RUN mkdir -p "/home/${CONTAINER_USER}/.local/share/claude-code" "/home/${CONTAINER_USER}/.local/bin"
COPY --chown=${USER_UID}:${USER_GID} claude-code/package.json claude-code/package-lock.json /home/${CONTAINER_USER}/.local/share/claude-code/
WORKDIR /home/${CONTAINER_USER}/.local/share/claude-code
RUN npm ci --no-audit --no-fund \
    && ln -s "/home/${CONTAINER_USER}/.local/share/claude-code/node_modules/.bin/claude" "/home/${CONTAINER_USER}/.local/bin/claude" \
    && npm cache clean --force

WORKDIR /
