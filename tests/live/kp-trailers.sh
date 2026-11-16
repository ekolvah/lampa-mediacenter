#!/usr/bin/env bash
# Живая проверка трейлеров в KP-карточках (plugins/kp-reactions-fix.js, change
# kp-card-trailers, design.md решение 9; change kp-trailers-ru-youtube — русский трейлер
# сервиса 127.0.0.1:9118; change trailers-external-player — трейлер играет SmartTube).
# Код выхода — итог: JS-шаг бросает исключение -> cdp.py выходит с 1, ui.py не туда -> 1,
# trailer_plays не дождался -> 1 -> set -e.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), плагин с трейлерами
# на приставке, сервис трейлеров в chroot, «Плеер для трейлеров» = YouTube и SmartTube,
# вошедший в аккаунт. Сам перезапускает Lampa и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-trailers
source tests/live/lib.sh

echo "== рестарт Lampa"
restart_lampa
step preflight

# Трейлер ушёл в SmartTube и играет: до 20 с ждём SmartTube на переднем плане и его
# media_session в state=3 (PLAYING), затем BACK и до 20 с ждём возврата Lampa. Цикл идёт на
# приставке одним adb shell (design.md решение 2); id ролика проверяет следующий step playing.
trailer_plays() {
  adb_sh '
    resumed() { dumpsys activity activities | grep mResumedActivity; }
    playing() {
      dumpsys media_session | sed -n "/package=org.smarttube.stable/,/package=/p" \
        | grep -q "state=PlaybackState {state=3,"
    }
    i=0
    until resumed | grep -q " org.smarttube.stable/" && playing; do
      i=$((i + 1))
      if [ $i -ge 20 ]; then
        echo "за 20 с SmartTube не играет:$(resumed);$(dumpsys media_session | grep -E "package=|state=PlaybackState")"
        exit 1
      fi
      sleep 1
    done
    input keyevent 4
    i=0
    until resumed | grep -q " top.rootu.lampa/"; do
      i=$((i + 1))
      if [ $i -ge 20 ]; then echo "за 20 с после BACK не вернулась Lampa:$(resumed)"; exit 1; fi
      sleep 1
    done
    echo "ok: SmartTube играл, Lampa снова на переднем плане"
  '
}

# Пультом «Смотреть» -> «Трейлеры» -> первый трейлер.
play_first_trailer() {
  python tools/ui.py --keys "DPAD_CENTER,DPAD_DOWN x3" --expect select
  step menu-focus
  python tools/ui.py --keys "DPAD_CENTER" --expect select
  python tools/ui.py --keys "DPAD_CENTER"
  trailer_plays
  step playing
}

echo "== «Зверь» (без imdb_id): первым русский трейлер сервиса, кнопка «Трейлер» играет его с пульта"
step open-card-no-imdb
python tools/ui.py --keys "DPAD_RIGHT"
step button-focus
python tools/ui.py --keys "DPAD_CENTER"
trailer_plays
step playing

echo "== «Зверь»: тот же ролик через «Смотреть» -> «Трейлеры»"
# После возврата из SmartTube Lampa сама ставит фокус на «Смотреть»; не так — упадёт menu-focus.
play_first_trailer

echo "== «1+1» (с imdb_id): «Трейлеры» есть, трейлер играет с пульта"
step open-card
play_first_trailer

echo "OK: kp-trailers"
