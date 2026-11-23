#!/usr/bin/env bash
# Живая проверка: TMDB в Lampa идёт мимо прокси Lampac, который вырезает тайтлы (change
# disable-lampac-tmdb-proxy, #73), а тайтлы из DMCA-списка CUB открываются карточками tmdb и cub
# (change disable-dmca-block, #106), а тайтл из списка CUB «смотреть на Кинопоиске» — обычной карточкой
# с кнопками плагина (change disable-kinopoisk-redirect, #110). Код выхода — итог: JS-шаг бросает исключение -> cdp.py
# выходит с 1 -> set -e.
#
# Когда гонять: после любой правки on.js или настроек аккаунта Lampac и перед правкой плагина,
# ходящего в TMDB, в том числе перед сменой sha plugins/kp-reactions-fix.js. Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555). Сам
# перезапускает Lampa и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/tmdb-access
source tests/live/lib.sh

echo "== рестарт Lampa: модули Lampac грузятся заново"
restart_lampa
step tmdb-unfiltered
step dmca-unblocked
step kinopoisk-card

echo "OK: tmdb-access"
