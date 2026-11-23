#!/usr/bin/env bash
# Живая проверка: закладки показывают тайтл одной карточкой, даже если он добавлен из KP и из TMDB
# (plugins/kp-reactions-fix.js, change favorites-dedup-across-sources, #112). Только чтение закладок,
# аккаунт не правится. Код выхода — итог: JS-шаг бросает исключение -> cdp.py выходит с 1 -> set -e.
#
# Когда гонять: перед сменой sha plugins/kp-reactions-fix.js и после — ловит смену имён или порядка
# вызовов закладок в ядре. Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), аккаунт с
# CUB-синхронизацией и закладками. Сам перезапускает Lampa и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/favorites
source tests/live/lib.sh

echo "== рестарт Lampa: плагины и закладки грузятся заново"
restart_lampa
step one-card

echo "OK: favorites"
