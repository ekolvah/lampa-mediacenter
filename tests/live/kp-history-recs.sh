#!/usr/bin/env bash
# Живая проверка KP-истории в ряду «Рекомендуем посмотреть» (plugins/kp-reactions-fix.js, change
# kp-history-recommendations, сценарий «Очередь на приставке»). Код выхода — итог: JS-шаг бросает
# исключение -> cdp.py выходит с 1 -> set -e; ядро не отсканировало KP-тайтл за 150 с -> exit 1.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), KP-записи с imdb_id в
# истории, плагин с рекомендациями на приставке. Сам перезапускает Lampa на экран (в фоне WebView
# замораживает таймеры ядра) и ставит DevTools forward. cdp.py ждёт ответа шага не дольше 20 с,
# поэтому тик ядра (раз в 120 с) ждёт цикл коротких шагов.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-history-recs
source tests/live/lib.sh

echo "== рестарт Lampa: проход плагина по KP-истории"
restart_lampa
step capture
# Проход плагина не дольше 60 с от готовности приложения (RECS_TIMEOUT_MS).
sleep 45
step queued

echo "== тик ядра: первый вставленный KP-тайтл отсканирован, просмотренного нет в списке"
scanned=
for _ in $(seq 10); do
  out=$(step scanned)
  echo "$out"
  case $out in *'"ok:'*) scanned=$(sed -n 's/.*scanned \([^,]*\),.*/\1/p' <<<"$out"); break ;; esac
done
[ -n "$scanned" ] || { echo "FAIL: ядро не отсканировало KP-тайтл за 150 с"; exit 1; }

echo "== рестарт Lampa: вставленные записи на месте"
restart_lampa
{ cat tests/live/lib.js "$DIR/lib.js"; echo "var SCANNED = '$scanned';"; cat "$DIR/persisted.js"; } | python tools/cdp.py

echo "OK: kp-history-recs"
