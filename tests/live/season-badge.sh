#!/usr/bin/env bash
# Живая проверка: метка сезона на карточках сериалов (plugins/kp-reactions-fix.js, change
# season-complete-badge, #116). Только чтение: закладки и настройки не правятся, счётчик запросов
# живёт до рестарта Lampa. Код выхода — итог: JS-шаг бросает исключение -> cdp.py выходит с 1 -> set -e.
#
# Когда гонять: перед сменой sha plugins/kp-reactions-fix.js и после — ловит переименование
# Lampa.Maker / Card.onVisible ядра и шторм запросов tv/<id>. Требует: ADB к приставке (UGOOS, по
# умолчанию 192.168.10.5:5555), Главную KP, в «Избранном» — сериалы tmdb/cub. Сам перезапускает Lampa
# и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/season-badge
source tests/live/lib.sh

echo "== рестарт Lampa: метки строятся с нуля"
restart_lampa
step home
step bookmarks
step idle

echo "OK: season-badge"
