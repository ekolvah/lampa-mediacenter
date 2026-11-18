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
# приставке одним adb shell (design.md решение 2); затем step playing проверяет отданный id.
trailer_plays() {
  adb_sh '
    resumed() { dumpsys activity activities | grep mResumedActivity; }
    front() { resumed | grep -q " $1/"; }
    st_playing() {
      front org.smarttube.stable && dumpsys media_session \
        | sed -n "/package=org.smarttube.stable/,/package=/p" | grep -q "state=PlaybackState {state=3,"
    }
    wait20() {  # $1 — что ждём (для сообщения), остальное — условие
      what=$1; shift; i=0
      until "$@"; do
        i=$((i + 1))
        if [ $i -ge 20 ]; then
          echo "за 20 с не дождались: $what;$(resumed);$(dumpsys media_session | grep -E "package=|state=PlaybackState")"
          exit 1
        fi
        sleep 1
      done
    }
    wait20 "SmartTube играет" st_playing
    input keyevent 4
    wait20 "Lampa после BACK" front top.rootu.lampa
    echo "ok: SmartTube играл, Lampa снова на переднем плане"
  '
  step playing
}

# Пультом «…» -> «Смотреть» -> «Трейлеры» -> первый трейлер. Фокус на «Торренты»; вправо «Трейлер»,
# «Избранное», «Реакции», «…» («Подписаться» скрыта); первый пункт «Еще» — «Смотреть» (spec
# card-buttons). Число нажатий проверяет menu-focus.
play_first_trailer() {
  python tools/ui.py --keys "DPAD_RIGHT x4,DPAD_CENTER,DPAD_CENTER,DPAD_DOWN x3" --expect select
  step menu-focus
  python tools/ui.py --keys "DPAD_CENTER" --expect select
  python tools/ui.py --keys "DPAD_CENTER"
  trailer_plays
}

# Шаг $1 (необязателен: карточка уже открыта) открывает карточку и задаёт window.__kpRuTrailer;
# пультом «Торренты» -> «Трейлер», играет он.
play_trailer_button() {
  [ -n "${1:-}" ] && step "$1"
  python tools/ui.py --keys "DPAD_RIGHT"
  step button-focus
  python tools/ui.py --keys "DPAD_CENTER"
  trailer_plays
}

echo "== «Зверь» (без imdb_id): первым русский трейлер сервиса, кнопка «Трейлер» играет его с пульта"
play_trailer_button open-card-no-imdb

echo "== «Зверь»: тот же ролик через «…» -> «Смотреть» -> «Трейлеры»"
# После возврата из SmartTube Lampa сама ставит фокус на «Торренты»; не так — упадёт menu-focus.
play_first_trailer

echo "== «1+1» (с imdb_id): «Торренты» открывают список торрентов, кнопка «Трейлер» играет трейлер"
step open-card
python tools/ui.py --keys "DPAD_CENTER"
step torrents-open
python tools/ui.py --keys "BACK"
play_trailer_button

echo "== «Джентльмены» (сериал, вышло 2 сезона): кнопка «Трейлер» играет трейлер 2-го сезона"
play_trailer_button open-card-season

echo "OK: kp-trailers"
