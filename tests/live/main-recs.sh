#!/usr/bin/env bash
# Живая проверка рядов рекомендаций на Главной KP (plugins/kp-reactions-fix.js, change
# kp-main-recommendations, сценарий «Ряды на приставке»). Код выхода — итог: JS-шаг бросает
# исключение -> cdp.py выходит с 1 -> exit 1; ряды дважды собраны до конца прохода -> exit 1.
#
# Требует: ADB к приставке (UGOOS, по умолчанию 192.168.10.5:5555), источник Главной KP,
# рекомендации ядра обоих типов, плагин с рядами рекомендаций на приставке. Сам перезапускает
# Lampa на экран (в фоне WebView замораживает таймеры) и ставит DevTools forward.
set -euo pipefail
cd "$(dirname "$0")/../.."

DIR=tests/live/kp-history-recs
source tests/live/lib.sh

# Шаг отвечает "wait:", если у рядов « · неполный»: при холодном кэше движка проход по KP-истории
# дольше 5 с (design.md, Risks). Второй запуск идёт по прогретому кэшу.
for attempt in 1 2; do
  echo "== рестарт Lampa: Главная собирается заново (заход $attempt)"
  restart_lampa
  out=$(step main-recs) || { echo "$out" >&2; exit 1; }
  echo "$out"
  case $out in *'"wait:'*) ;; *) echo "OK: main-recs"; exit 0 ;; esac
done
echo "FAIL: ряды рекомендаций дважды собраны до конца прохода по KP-истории" >&2
exit 1
