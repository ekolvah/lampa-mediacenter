#!/usr/bin/env bash
# Живая проверка KP-истории в ряду «Рекомендуем посмотреть» (plugins/kp-reactions-fix.js, change
# kp-history-recommendations, сценарий «Очередь на приставке»). Код выхода — итог: JS-шаг бросает
# исключение -> cdp.py выходит с 1 -> set -e; шаг не дождался (ядро не отсканировало KP-тайтл за 150 с) -> exit 1.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), KP-записи с imdb_id в
# истории, плагин с рекомендациями на приставке. Сам перезапускает Lampa на экран (в фоне WebView
# замораживает таймеры ядра) и ставит DevTools forward. cdp.py ждёт ответа шага не дольше 20 с,
# поэтому тик ядра (раз в 120 с) ждёт цикл коротких шагов.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-history-recs
source tests/live/lib.sh

# Повторяет шаг, пока он отвечает "wait:", не больше $1 раз: ответы — в stderr, ответ "ok:" — в stdout.
retry_step() {
  local out
  for _ in $(seq "$1"); do
    out=$(step "$2") || { echo "$out" >&2; return 1; }
    echo "$out" >&2
    case $out in *'"ok:'*) echo "$out"; return 0 ;; esac
  done
  echo "FAIL: шаг $2 не дождался ответа ok за $1 попыток" >&2
  return 1
}

echo "== рестарт Lampa: проход плагина по KP-истории"
restart_lampa
step capture
# Проход плагина не дольше 60 с от готовности приложения (RECS_TIMEOUT_MS), шаг ждёт до 15 с.
retry_step 5 queued >/dev/null

echo "== тик ядра (раз в 120 с): первый вставленный KP-тайтл отсканирован, просмотренного нет в списке"
scanned=$(retry_step 10 scanned | sed -n 's/.*scanned \([^,]*\),.*/\1/p')

echo "== рестарт Lampa: отметка скана на месте"
restart_lampa
step persisted "var SCANNED = '$scanned';"

echo "OK: kp-history-recs"
