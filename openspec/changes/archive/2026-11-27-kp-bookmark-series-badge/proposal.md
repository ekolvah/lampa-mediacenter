## Why

На KP-карточках сериалов в «Избранном» нет метки сезона (#117 выкачен 2026-11-27). Плагин считает
KP-карточку сериалом только при `type === 'tv'`, а у сохранённых в закладки KP-карточек поля `type`
нет.

**Воспроизведение** (устройство, 2026-11-27, `plugins/kp-reactions-fix.js@a3c5987`, после рестарта,
журнал — `snapshots/2026-11-27_kp-reactions-fix-pin-main-117/NOTES.md`). Подсчёт KP-карточек в DOM
после Главной KP и «Избранного»: `type=movie` без `original_name` — 8, `type=tv` с `original_name` — 7,
**без `type` с `original_name` — 6**, и у всех шести метки нет. Сбойная запись — «Бегущий по лезвию
2099» `KP_4855987`: поля `original_name`, `first_air_date: 2026-11-25`, `number_of_seasons: 1`, `type` нет.
Рабочая запись из того же ответа — tmdb-карточка «Список смертников» `120911`: метка `S2 ✓`. На скриншоте
у обеих есть `TV` ядра.

**Причина.** Признак сериала у KP-карточки — `original_name`: `kp_source.js` ставит его только сериалам.
Проверено по коду (`https://nb557.github.io/plugins/kp_source.js`, 2026-11-27): строка 195 —
`var type = !elem.type || elem.type === 'FILM' || elem.type === 'VIDEO' ? 'movie' : 'tv';`, строки 261–263 —
`if (type === 'tv') { result.name = title; result.original_name = original_title; …`. А `isSeries`,
`searchByTitle` и `resolveTitle` смотрят только на `type`.

## Standard approach

- Правило ядра Lampa: сериал — карточка с `original_name` (маркер `TV`, `TimeTable.update`). Записано в
  `openspec/changes/archive/2026-11-27-season-complete-badge/design.md`, решение 3, и уже применяется
  в `isSeries` к источникам `tmdb` и `cub`.
- Правило источника: `kp_source.js` (`https://nb557.github.io/plugins/kp_source.js`, прочитан
  2026-11-27) выставляет `original_name` только при `type === 'tv'` (строки 195, 261–263, цитаты выше). Своего правила не нужно: берётся то же, что у ядра.

## What Changes

- KP-карточка считается сериалом, если `type === 'tv'` или, когда `type` нет, если есть
  `original_name`. Это правило работает в одном месте и действует в трёх: метка сезона (`isSeries`), тип поиска TMDB
  (`searchByTitle`) и выбор сериала из ответа `find` (`resolveTitle`).
- Живая проверка `tests/live/season-badge.sh`: шаг «Избранного» проверяет и KP-сериалы.

## Capabilities

### New Capabilities

### Modified Capabilities
- `card-season-badge`: требование «Любой экран и источник» — как определяется KP-сериал, новый
  сценарий KP-карточки без `type`.
- `kp-card-trailers`: требование с выбором типа поиска — KP-карточка без `type` с `original_name`
  ищется среди сериалов.

## Impact

- Изменяются: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/season-badge/lib.js`, `tests/live/season-badge/home.js`,
  `tests/live/season-badge/bookmarks.js`.
- Не меняются: строки с `type === 'tv'` в коде трейлеров полноэкранной карточки и рядов «Сейчас
  смотрят». Их карточки строит `convertElem` из `kp_source.js`, и `type` там всегда есть.
- Выкатка: sha `kp-reactions-fix.js` на устройстве переводится на мерж-коммит (снапшот `plugins`).
