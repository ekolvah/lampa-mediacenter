#!/bin/bash
# Запуск сервиса Debian-chroot в фоне через start-stop-daemon (стандарт Debian для демона
# без init). Кладётся в /data/debian/root/chroot-start.sh, вызывается из start.d/*.sh:
#
#   chroot-start.sh <name> <workdir> <exec> [args…]
#
# pid-файл <workdir>/<name>.pid, лог <workdir>/run.log. Идемпотентен: живой процесс с этим
# <exec> (--exec сверяет /proc/<pid>/exe) — «already running», код 0; pid-файл от упавшего
# или чужого процесса не мешает старту. Упал на старте — хвост run.log, код 1.
# Окружение сервиса (PATH, TMPDIR, …) задаёт вызывающий.
set -u
if [ "$#" -lt 3 ]; then
  echo "usage: chroot-start.sh <name> <workdir> <exec> [args...]" >&2
  exit 2
fi
name=$1 workdir=$2 exe=$3
shift 3
pidfile=$workdir/$name.pid
log=$workdir/run.log

ssd() { start-stop-daemon --pidfile "$pidfile" --exec "$exe" "$@"; }

failed() {
  echo "$name FAILED to start, run.log:"
  tail -20 "$log"
  exit 1
}

if ssd --status; then
  echo "$name already running pid=$(cat "$pidfile")"
  exit 0
fi

: > "$log"
ssd --start --background --make-pidfile --chdir "$workdir" --output "$log" -- "$@" || failed

# Трёх секунд хватает, чтобы упавший на старте процесс уже не числился живым.
sleep 3
ssd --status || failed
echo "$name started pid=$(cat "$pidfile")"
