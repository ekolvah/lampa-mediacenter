#!/usr/bin/env bash
# Живая проверка рядов новинок на Главной KP (plugins/kp-reactions-fix.js, changes
# now-watching-new-releases, now-watching-new-first и now-watching-open-any-source). Код выхода — итог: JS-шаг бросает
# исключение -> cdp.py выходит с 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), источник Главной KP,
# плагин с рядами новинок на приставке. Сам перезапускает Lampa на экран (в фоне WebView
# замораживает таймеры, и cdp.py висит) и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/now-watching
source tests/live/lib.sh

# WebView пишет localStorage на диск с задержкой: force-stop сразу после записи теряет её
# (tests/live/kp-history-recs.sh).
restart_after_write() {
  sleep 15
  restart_lampa
}

echo "== рестарт Lampa: Главная собирается заново"
restart_lampa
step rows

echo "== память рядов: из ряда фильмов забыта карточка не с первого места"
out=$(step new-first)
echo "$out"
id=$(printf '%s' "$out" | sed -n 's/.*id \(KP_[0-9]*\).*/\1/p')
[ -n "$id" ] || { echo "FAIL: new-first не вернул id" >&2; exit 1; }

echo "== рестарт Lampa: $id первая в ряду, открывается карточка её TMDB-тайтла"
restart_after_write
step new-first-check "var ID = '$id', OPENED = false;"

echo "== рестарт Lampa: открытая $id на месте по порядку коллекции"
restart_after_write
step new-first-check "var ID = '$id', OPENED = true;"

echo "OK: now-watching"
