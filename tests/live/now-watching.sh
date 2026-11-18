#!/usr/bin/env bash
# Живая проверка рядов новинок на Главной KP (plugins/kp-reactions-fix.js, change
# now-watching-new-releases, design.md решение 7). Код выхода — итог: JS-шаг бросает
# исключение -> cdp.py выходит с 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), источник Главной KP,
# плагин с рядами новинок на приставке. Сам перезапускает Lampa на экран (в фоне WebView
# замораживает таймеры, и cdp.py висит) и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/now-watching
source tests/live/lib.sh

echo "== рестарт Lampa: Главная собирается заново"
restart_lampa
step rows

echo "OK: now-watching"
