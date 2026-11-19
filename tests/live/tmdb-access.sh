#!/usr/bin/env bash
# Живая проверка: TMDB в Lampa идёт мимо прокси Lampac, который вырезает тайтлы (change
# disable-lampac-tmdb-proxy, #73). Код выхода — итог: JS-шаг бросает исключение -> cdp.py
# выходит с 1 -> set -e.
#
# Когда гонять: после любой правки on.js или настроек аккаунта Lampac и перед правкой плагина,
# ходящего в TMDB. Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555). Сам
# перезапускает Lampa и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/tmdb-access
source tests/live/lib.sh

echo "== рестарт Lampa: модули Lampac грузятся заново"
restart_lampa
step tmdb-unfiltered

echo "OK: tmdb-access"
