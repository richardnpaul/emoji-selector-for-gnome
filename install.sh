#!/usr/bin/env bash
# Installs the extension for the current user, from a fresh build of the same zip that is uploaded to
# extensions.gnome.org. Not recommended: an extension installed this way is never updated.
#
# Usage: ./install.sh [--system]
#
#   --system   install for every user (in /usr/share/gnome-shell/extensions); must be run as root
#
# Environment: EXTENSIONS_DIR (an absolute path) overrides where the extension is installed.
set -euo pipefail

readonly UUID='emoji-selector@maestroschan.fr'

work=''
staged=''
cleanup() {
	if [[ -n $work ]]; then
		rm -rf -- "${work:?}"
	fi
	if [[ -n $staged ]]; then
		rm -rf -- "${staged:?}"
	fi
}
trap cleanup EXIT

usage() {
	echo "Usage: $0 [--system]" >&2
	exit 2
}

system=0
for argument in "$@"; do
	case $argument in
	--system) system=1 ;;
	*) usage ;;
	esac
done

for tool in unzip glib-compile-schemas; do
	if ! command -v "$tool" >/dev/null; then
		echo "Required tool not found: $tool" >&2
		exit 1
	fi
done

if ((system)); then
	if ((EUID != 0)); then
		echo "--system installs for every user, so it must be run as root." >&2
		exit 1
	fi
	default_dir=/usr/share/gnome-shell/extensions
else
	default_dir="${XDG_DATA_HOME:-${HOME:?HOME is not set}/.local/share}/gnome-shell/extensions"
fi

destination=${EXTENSIONS_DIR:-$default_dir}
if [[ $destination != /* ]]; then
	echo "EXTENSIONS_DIR must be an absolute path, not '$destination'." >&2
	exit 1
fi
target="$destination/$UUID"

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ $target -ef $root/$UUID ]]; then
	echo "EXTENSIONS_DIR is this working tree: installing would replace the extension's sources." >&2
	exit 1
fi
work=$(mktemp -d)

# Build and unpack first: an existing install is only replaced once the new one is ready.
"$root/build-a-zip.sh" "$work/build" >/dev/null
mkdir -p -- "$destination"
staged="$destination/.$UUID.new.$$"
mkdir -- "$staged"
unzip -q -- "$work/build/$UUID.zip" -d "$staged"
glib-compile-schemas --strict "$staged/schemas"

echo "Installing extension files in $target"
rm -rf -- "${target:?}"
# -T: if a concurrent install got there first this fails, rather than nesting the new files in its.
mv -T -- "$staged" "$target"
staged=''

echo "Done. Restart GNOME Shell (log out and in again) to load it, then run:"
echo "  gnome-extensions enable $UUID"
