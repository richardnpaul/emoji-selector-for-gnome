#!/usr/bin/env bash
# Creates the empty catalogue of a language from the template: every message, none translated.
#
# Usage: ./new-catalogue.sh LANGUAGE        (for instance ja, or pt_BR)
#
# LANGUAGE is how glibc names a locale: two or three lower-case letters, then optionally _ and a territory
# in capitals. It is also the name of the catalogue's directory, which is what the locale of a real user
# is matched against (a name such as zh_Hans is never matched). The catalogue is only created if there is
# none: translated work is never overwritten. Fill it in, then run ./update-and-compile-translations.sh.
set -euo pipefail

readonly DOMAIN='emoji-selector'

work=''
cleanup() {
	if [[ -n $work ]]; then
		rm -rf -- "${work:?}"
	fi
}
trap cleanup EXIT

usage() {
	echo "Usage: $0 LANGUAGE   (a locale name such as ja or pt_BR)" >&2
	exit 2
}

(($# == 1)) || usage
name=$1
[[ $name =~ ^[a-z]{2,3}(_[A-Z]{2})?$ ]] || {
	echo "'$name' is not a language name that a locale matches (expected ja, pt_BR, ...)." >&2
	usage
}

if ! command -v msginit >/dev/null; then
	echo "Required tool not found: msginit" >&2
	exit 1
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

locale_dir=assets/locale
template="$locale_dir/$DOMAIN.pot"
catalogue="$locale_dir/$name/LC_MESSAGES/$DOMAIN.po"

if [[ ! -f $template ]]; then
	echo "Template not found: $template (run ./update-and-compile-translations.sh)" >&2
	exit 1
fi
if [[ -e $catalogue ]]; then
	echo "$catalogue already exists." >&2
	exit 1
fi

# (msginit mishandles a UTF-8 template when its output file already exists, so it gets a fresh path.)
work=$(mktemp -d)
created="$work/$DOMAIN.po"
if ! msginit --no-translator --no-wrap --locale="$name" --input="$template" --output-file="$created" >/dev/null 2>"$work/msginit.log"; then
	cat -- "$work/msginit.log" >&2
	exit 1
fi
# (msginit shortens the language of a default territory, pt_PT to pt: the header must say what the directory says.)
sed -i "s/^\"Language: .*\\\\n\"\$/\"Language: $name\\\\n\"/" -- "$created"
if ! grep -q '^"Plural-Forms:' -- "$created"; then
	echo "Warning: msginit does not know the Plural-Forms of '$name': add the line to the header by hand." >&2
fi

mkdir -p -- "$locale_dir/$name/LC_MESSAGES"
mv -n -- "$created" "$catalogue"
echo "Created $catalogue"
