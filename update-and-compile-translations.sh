#!/usr/bin/env bash
# Extracts the translatable strings into the template (.pot), merges them into every language's
# catalogue (.po), and compiles the catalogues (.mo) that ship with the extension.
#
# Usage: ./update-and-compile-translations.sh
#
# The template is only rewritten when a message changed, so running this on unchanged sources
# changes nothing (xgettext would otherwise stamp the current time into it every run).
set -euo pipefail

readonly DOMAIN='emoji-selector'
readonly UUID='emoji-selector@maestroschan.fr'

if (($# != 0)); then
	echo "Usage: $0" >&2
	exit 2
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

for tool in xgettext msgmerge msgfmt grep; do
	if ! command -v "$tool" >/dev/null; then
		echo "Required tool not found: $tool" >&2
		exit 1
	fi
done

locale_dir="$UUID/locale"
template="$locale_dir/$DOMAIN.pot"

fresh_template=$(mktemp)
trap 'rm -f -- "${fresh_template:?}"' EXIT

echo "Generating $template..."
# (An unusable GIT_DIR stops xgettext from asking git for file dates, and from complaining about names it cannot parse.)
GIT_DIR=/nonexistent xgettext --files-from=POTFILES.in --from-code=UTF-8 --add-location=file --output="$fresh_template"

without_date() {
	grep -v '^"POT-Creation-Date:' -- "$1"
}
if [[ -f $template && $(without_date "$template") == "$(without_date "$fresh_template")" ]]; then
	echo "No message changed."
else
	# Not mv: the template keeps its own permissions (mktemp files are private).
	cat -- "$fresh_template" >"$template"
fi

shopt -s nullglob
for catalogue in "$locale_dir"/*/LC_MESSAGES/"$DOMAIN.po"; do
	language=${catalogue#"$locale_dir"/}
	language=${language%%/*}

	echo "Updating translation for: $language"
	msgmerge --update --backup=none --previous --quiet "$catalogue" "$template"

	echo "Compiling translation for: $language"
	if ! msgfmt --check --output-file="${catalogue%.po}.mo" "$catalogue"; then
		echo "$catalogue is not a valid catalogue." >&2
		exit 1
	fi
done
