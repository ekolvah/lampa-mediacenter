#!/usr/bin/env bash
# Живая проверка трейлеров в KP-карточках (plugins/kp-reactions-fix.js, change
# kp-card-trailers, design.md решение 9). Код выхода — итог: JS-шаг бросает исключение ->
# cdp.py выходит с 1, ui.py не туда -> 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), плагин с трейлерами
# на приставке, «Плеер для трейлеров» = встроенный. Сам перезапускает Lampa и ставит
# DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-trailers
source tests/live/lib.sh

echo "== рестарт Lampa"
restart_lampa

echo "== шаг 1: в KP-карточке есть «Трейлеры»"
step open-card

echo "== шаг 2: пультом «Смотреть» -> «Трейлеры» -> первый трейлер"
python tools/ui.py --keys "DPAD_CENTER,DPAD_DOWN x3" --expect select
step menu-focus
python tools/ui.py --keys "DPAD_CENTER" --expect select
python tools/ui.py --keys "DPAD_CENTER"

echo "== шаг 3: трейлер играет"
step playing

echo "OK: kp-trailers"
