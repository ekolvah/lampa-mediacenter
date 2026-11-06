#!/usr/bin/env bash
# Живая проверка скрытия карточек без раздач (plugins/torrent-quality-badge.js).
# Шаги — design.md решение 8 change'а hide-cards-without-torrents; код выхода — итог:
# JS-шаг бросает исключение -> cdp.py выходит с 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), плагин на
# приставке с applyVerdict (сборка ветки или main после мержа), тёплый кэш плагина
# и непустой фильтр раздач. Сам перезапускает Lampa и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

UGOOS=${UGOOS:-192.168.10.5:5555}
DIR=tests/live/hide-cards
adb_sh() { MSYS_NO_PATHCONV=1 adb -s "$UGOOS" shell "$@"; }
step() { cat "$DIR/lib.js" "$DIR/$1.js" | python tools/cdp.py; }

restart_lampa() {
  adb_sh "am force-stop top.rootu.lampa"
  adb_sh "monkey -p top.rootu.lampa -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
  sleep 15
  pid=$(adb_sh "pidof top.rootu.lampa" | tr -d '\r')
  MSYS_NO_PATHCONV=1 adb -s "$UGOOS" forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
}

echo "== рестарт Lampa"
restart_lampa

echo "== шаг 1: вердикты из кэша применены очередью"
step warm-cache

echo "== шаг 2: скрыта карточка под фокусом"
step hide-focused
python tools/ui.py --keys "DPAD_RIGHT,DPAD_LEFT" --expect items_line
step focus-in-row

# Шаги 3-4 x10 на разных рядах: в спайке фокус после опустошения ряда терялся 1 раз из 3.
for run in 0 1 2 3 4 5 6 7 8 9; do
  echo "== шаги 3-4, прогон $run"
  step rebuild-main
  down=$((run % 4))
  if [ "$down" -gt 0 ]; then python tools/ui.py --keys "DPAD_DOWN x$down" --expect items_line; fi
  step cascade-to-three
  step empty-row
done

echo "== шаг 5: Избранное не шлёт событий ряда"
step bookmarks-open
python tools/ui.py --keys "DPAD_RIGHT x8"
step bookmarks-check

echo "OK: hide-cards"
