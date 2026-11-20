## Why

Tracking issue #81. Рядов «Рекомендуем посмотреть» на Главной KP нет. Ядро добавляет ряд
`recomend_watch` только через `ContentRows.call('main', …)` из `main` источников `tmdb` и `cub`.
`kp_source` собирает Главную сам и `ContentRows` не зовёт, а свой ряд рекомендаций строит только на
вкладках «Фильмы» и «Сериалы». Код ядра и `kp_source` — в design.md, «Standard approach».

Наблюдение на приставке 2026-11-20: первые ряды Главной (`component: 'main'`, `source: KP`) —
«Сейчас смотрят фильмы», «Сейчас смотрят сериалы», «Топ фильмы», «Топ сериалы», «Популярные
фильмы». Данные для рядов есть: `Lampa.Recomends.get('movie')` — 73 тайтла, `get('tv')` — 41.
Тайтлы KP-истории из них убирает проход `kp-reactions-fix.js` (#77), а он идёт одновременно со
сборкой Главной (замер в design.md).

## What Changes

- На Главной KP за рядами «Сейчас смотрят» появляются «Рекомендуем посмотреть фильмы» и
  «Рекомендуем посмотреть сериалы» из рекомендаций ядра, до 40 карточек в ряду, с «Ещё» на
  штатный экран ядра.
- Первая порция Главной ждёт конца прохода по KP-истории в пределах прежних 5 с. Если проход не
  успел, у рядов пометка « · неполный».
- Пустые рекомендации и отсутствие функции ядра видны в консоли и `Lampa.Noty`.

## Capabilities

### New Capabilities

- `kp-main-recommendations`: ряды рекомендаций ядра (фильмы и сериалы) на Главной KP, без
  тайтлов из истории, в том числе KP-истории.

### Modified Capabilities

Нет.

## Impact

- Изменены:
  - `plugins/kp-reactions-fix.js`;
  - `tests/js/kp-reactions-fix.test.js`;
  - `docs/lampa-config-review.md`: в строку плагина `kp-reactions-fix.js` добавить ряды
    рекомендаций на Главной.
- Добавлены:
  - `tests/live/main-recs.sh`, `tests/live/kp-history-recs/main-recs.js` — живая проверка;
  - `openspec/changes/kp-main-recommendations/`.
- На приставке: новый пин `kp-reactions-fix.js` (design.md, Migration Plan).
