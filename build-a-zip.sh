#!/usr/bin/env bash
# Builds the zip that is uploaded to extensions.gnome.org (and that `gnome-extensions install` installs).
#
# Usage: ./build-a-zip.sh [OUTPUT_DIR]       (default: ./dist)
#
# Run `npm run build:ts` first: the extension is written in TypeScript, and the zip holds the
# JavaScript that the compiler writes to dist/<uuid>/, together with the assets that live in <uuid>/
# (metadata, schema, stylesheet, icons and compiled translations).
#
# Only an explicit list of files ships: the source translations (.po/.pot), the compiled schema
# (extensions.gnome.org compiles it itself) and any stray editor or backup file stay out. Nothing in
# the source tree is modified, and an earlier zip is only replaced once the new one is complete.
set -euo pipefail

readonly UUID='emoji-selector@richardnpaul.github.com'
readonly REQUIRED_COMPILED=(extension.js prefs.js)
readonly REQUIRED_ASSETS=(metadata.json stylesheet.css)
readonly COMPILED_PATHS='\./([A-Za-z]+\.js|(lib|data)/[A-Za-z]+\.js)'
readonly ASSET_PATHS='\./(metadata\.json|stylesheet\.css|schemas/[A-Za-z0-9.-]+\.gschema\.xml|locale/[A-Za-z0-9_-]+/LC_MESSAGES/emoji-selector\.mo|icons/[A-Za-z0-9-]+\.svg)'

partial_file=''
stage=''
cleanup() {
	if [[ -n $partial_file ]]; then
		rm -f -- "${partial_file:?}"
	fi
	if [[ -n $stage ]]; then
		rm -rf -- "${stage:?}"
	fi
}
trap cleanup EXIT

usage() {
	echo "Usage: $0 [OUTPUT_DIR]" >&2
	exit 2
}

(($# <= 1)) || usage
for tool in zip find sed sort cp xargs; do
	if ! command -v "$tool" >/dev/null; then
		echo "Required tool not found: $tool" >&2
		exit 1
	fi
done

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
assets_dir="$root/assets"
compiled_dir="$root/dist/extension"
if [[ ! -d $assets_dir ]]; then
	echo "Extension directory not found: $assets_dir" >&2
	exit 1
fi
if [[ ! -d $compiled_dir ]]; then
	echo "Compiled extension not found: $compiled_dir (run 'npm run build:ts' first)" >&2
	exit 1
fi
for file in "${REQUIRED_COMPILED[@]}"; do
	if [[ ! -f $compiled_dir/$file ]]; then
		echo "Missing $file in $compiled_dir (run 'npm run build:ts' first)" >&2
		exit 1
	fi
done
for file in "${REQUIRED_ASSETS[@]}"; do
	if [[ ! -f $assets_dir/$file ]]; then
		echo "Missing $file in $assets_dir" >&2
		exit 1
	fi
done

output_dir=${1:-$root/dist}
if [[ $output_dir != /* ]]; then
	output_dir="$PWD/$output_dir"
fi
mkdir -p -- "$output_dir"
zip_file="$output_dir/$UUID.zip"
partial_file="$output_dir/.$UUID.zip.$$"

# Gather the files that ship in one place, so that the zip lists them in a stable order.
stage=$(mktemp -d)
copy_matching() {
	local from=$1 pattern=$2
	(
		cd -- "$from"
		find . -type f -regextype posix-extended -regex "$pattern" -print0 | xargs -0 --no-run-if-empty cp --parents -t "$stage"
	)
}
copy_matching "$compiled_dir" "$COMPILED_PATHS"
copy_matching "$assets_dir" "$ASSET_PATHS"
(
	cd -- "$stage"
	find . -type f | sed 's|^\./||' | LC_ALL=C sort | zip -X -q "$partial_file" -@
)

# -T: replace the zip itself, and fail (instead of moving into it) if that path is a directory.
mv -T -f -- "$partial_file" "$zip_file"
partial_file=''
echo "Built $zip_file"
