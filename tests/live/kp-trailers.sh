#!/usr/bin/env bash
# Живая проверка трейлеров в KP-карточках (plugins/kp-reactions-fix.js, change
# kp-card-trailers, design.md решение 9; change kp-trailers-ru-youtube — русский трейлер
# сервиса 127.0.0.1:9118). Код выхода — итог: JS-шаг бросает исключение ->
# cdp.py выходит с 1, ui.py не туда -> 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), плагин с трейлерами
# на приставке, сервис трейлеров в chroot, «Плеер для трейлеров» = встроенный. Сам перезапускает Lampa и ставит
# DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-trailers
source tests/live/lib.sh

echo "== рестарт Lampa"
restart_lampa

# Пультом «Смотреть» -> «Трейлеры» -> первый трейлер; $1 — шаг проверки открытого списка
# трейлеров перед запуском (необязательный). playing закрывает плеер.
play_first_trailer() {
  python tools/ui.py --keys "DPAD_CENTER,DPAD_DOWN x3" --expect select
  step menu-focus
  python tools/ui.py --keys "DPAD_CENTER" --expect select
  if [ $# -gt 0 ]; then step "$1"; fi
  python tools/ui.py --keys "DPAD_CENTER"
  step playing
}

echo "== «Зверь» (без imdb_id): первым русский трейлер сервиса, кнопка «Трейлер» играет его с пульта"
step open-card-no-imdb
python tools/ui.py --keys "DPAD_RIGHT"
step button-focus
python tools/ui.py --keys "DPAD_CENTER"
step playing

echo "== «Зверь»: тот же ролик через «Смотреть» -> «Трейлеры»"
python tools/ui.py --keys "DPAD_LEFT"
play_first_trailer trailer-focus

echo "== «1+1» (с imdb_id): «Трейлеры» есть, трейлер играет с пульта"
step open-card
play_first_trailer

echo "OK: kp-trailers"
