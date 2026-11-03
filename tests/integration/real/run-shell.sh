#!/usr/bin/env bash
# Runs a real, headless GNOME Shell with Emoji Selector and the test driver (tests/integration/real/
# shell-driver) installed under XDG_DATA_HOME, enables and disables the extension twice over D-Bus, and
# leaves the Shell's log where the test can read it.
#
# Usage: run-shell.sh XDG_DATA_HOME LOG_FILE UUID [LOCALE [texts | search WORD]]
#   UUID: the extension to drive, installed in XDG_DATA_HOME
#   LOCALE: the locale of the Shell (an installed one, such as ja_JP.utf8); default C.utf8
#   texts: only enable the extension once and report the texts it shows (the default is the whole scenario)
#   search WORD: only enable the extension once, type WORD (lower-case letters) in its search and report the results
#
# Needs no root and touches nothing outside its own temporary directory: the system bus it gives the
# Shell is a private one, with a fake logind on it (the Shell refuses to start without logind).
set -euo pipefail

DRIVER='emoji-test-driver@example.org'

if (($# < 3 || $# > 6)); then
	echo "Usage: $0 XDG_DATA_HOME LOG_FILE UUID [LOCALE [texts | search WORD]]" >&2
	exit 2
fi
data_home=$1
log_file=$2
UNDER_TEST=$3
locale=${4:-C.utf8}
DRIVER_MODE=${5:-full}
DRIVER_QUERY=${6:-}
if [[ $DRIVER_MODE != full && $DRIVER_MODE != texts && $DRIVER_MODE != search ]]; then
	echo "The mode must be 'texts' or 'search' (or nothing), not '$DRIVER_MODE'." >&2
	exit 2
fi
if [[ $DRIVER_MODE == search && ! $DRIVER_QUERY =~ ^[a-z]+$ ]]; then
	echo "The search mode needs a word of lower-case letters to type, not '$DRIVER_QUERY'." >&2
	exit 2
fi
if [[ $DRIVER_MODE != search && -n $DRIVER_QUERY ]]; then
	echo "Only the search mode takes a word." >&2
	exit 2
fi
if [[ $data_home != /* || $log_file != /* ]]; then
	echo "Both paths must be absolute." >&2
	exit 2
fi

work=$(mktemp -d)
pids=()
cleanup() {
	rm -rf -- "${data_home:?}/gnome-shell/extensions/${DRIVER:?}"
	local pid
	for pid in "${pids[@]}"; do
		kill "$pid" 2>/dev/null || true
		wait "$pid" 2>/dev/null || true
	done
	rm -rf -- "${work:?}"
}
trap cleanup EXIT

cat >"$work/system.conf" <<CONF
<busconfig>
  <type>system</type>
  <listen>unix:path=$work/system_bus_socket</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
    <allow user="*"/>
  </policy>
</busconfig>
CONF
dbus-daemon --config-file="$work/system.conf" --nofork >"$work/system-bus.log" 2>&1 &
pids+=($!)
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$work/system_bus_socket"
for _ in $(seq 50); do
	[[ -S $work/system_bus_socket ]] && break
	sleep 0.1
done
python3 -I -m dbusmock --system --template logind >"$work/logind.log" 2>&1 &
pids+=($!)
for _ in $(seq 50); do
	gdbus call --system --dest org.freedesktop.login1 --object-path /org/freedesktop/login1 \
		--method org.freedesktop.login1.Manager.ListSessions >/dev/null 2>&1 && break
	sleep 0.2
done

mkdir -p -- "$work/run" "$work/config" "$work/cache"
chmod 700 "$work/run"
export XDG_RUNTIME_DIR="$work/run" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export XDG_DATA_HOME="$data_home" GSETTINGS_BACKEND=memory

mkdir -p -- "$data_home/gnome-shell/extensions"
rm -rf -- "${data_home:?}/gnome-shell/extensions/${DRIVER:?}"
cp -r -- "$(dirname -- "${BASH_SOURCE[0]}")/shell-driver" "$data_home/gnome-shell/extensions/$DRIVER"

# Everything below runs on the Shell's own session bus.
cat >"$work/session.sh" <<'SESSION'
#!/usr/bin/env bash
set -euo pipefail

shell_pid=''
trap '[[ -z $shell_pid ]] || { kill "$shell_pid" 2>/dev/null || true; wait "$shell_pid" 2>/dev/null || true; }' EXIT

gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 >"$LOG_FILE" 2>&1 &
shell_pid=$!

extensions() {
	gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
		--method "org.gnome.Shell.Extensions.$1" "$2" >/dev/null
}
# wait_for MESSAGE COUNT: until the driver has reported MESSAGE that many times.
wait_for() {
	local seconds
	for seconds in $(seq 40); do
		if (($(grep -c -- "DRIVER {\"name\":\"$1\"" "$LOG_FILE" || true) >= $2)); then
			return 0
		fi
		sleep 1
	done
	echo "Timed out waiting for the driver to report '$1'." >&2
	return 1
}

for _ in $(seq 60); do
	gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
		--method org.freedesktop.DBus.NameHasOwner org.gnome.Shell 2>/dev/null | grep -q true && break
	sleep 1
done
# The Shell answers D-Bus calls a little before it can enable extensions.
sleep 2

extensions EnableExtension "$DRIVER"
wait_for ready 1
extensions EnableExtension "$UNDER_TEST"
if [[ $DRIVER_MODE == texts ]]; then
	wait_for texts 1
	exit 0
fi
if [[ $DRIVER_MODE == search ]]; then
	wait_for searched 1
	exit 0
fi
wait_for shortcut-on-again 1
extensions DisableExtension "$UNDER_TEST"
wait_for disabled 1
extensions EnableExtension "$UNDER_TEST"
wait_for left-open 1
extensions DisableExtension "$UNDER_TEST"
wait_for shortcut-after-disable 1
SESSION

# (The locale is the Shell's own, and so the language the extension is translated into.)
export UNDER_TEST DRIVER DRIVER_MODE DRIVER_QUERY LC_ALL="$locale"
# (The session bus starts a crowd of GNOME services that talk a lot; only a failure is worth showing.)
status=0
LOG_FILE=$log_file dbus-run-session -- bash "$work/session.sh" >"$work/session.log" 2>&1 || status=$?
if ((status != 0)); then
	cat -- "$work/session.log" "$work/system-bus.log" "$work/logind.log" >&2
	exit "$status"
fi
