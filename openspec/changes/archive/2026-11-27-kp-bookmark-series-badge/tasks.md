## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-bookmark-series-badge --planner Claude --implementer Claude`
  (tracking issue 118), дальше работа в `.claude/worktrees/kp-bookmark-series-badge`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: расширить существующие тесты.
  - `kp card badge via resolveTitle`: цикл по `kpShow()` и `kpShow({ type: undefined, original_name:
    GENTLEMEN.original_title })` — в обоих `find` с фильмом и сериалом даёт `tv/236235` и `S4 6/10`;
    плюс карточка без `type` и `imdb_id`, с `original_name` и `first_air_date` из `LIFE_TV`:
    `c.get` — `search/tv?…&first_air_date_year=2026`, метка по `tv/318582`. Каждая карточка — в
    своём `load()`: при общем memo `KP:KP_1` вторая взяла бы метку первой без поиска.
  - `movie card no badge no request`: элемент `{ id: 'KP_3', source: 'KP', title, original_title }`
    без `type` и `original_name` — метки нет, `c.get` и `c.tv` пусты.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 `isTvCard` в `plugins/kp-reactions-fix.js` по design, решение 1, и её вызов в
  `searchByTitle`, `resolveTitle` и ветке `KP` у `isSeries`, комментарий над `isSeries` — по
  правилу. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js` зелёный, включая прежние тесты. Коммит.

## 3. Живая проверка

- [x] 3.1 `tests/live/season-badge/lib.js` (`SB.kpSeries` из `home.js`, `SB.series` для `KP` по
  правилу решения 1), `home.js` (зовёт `SB.kpSeries`) и `bookmarks.js` (метка на каждом KP-сериале
  «Избранного», список — в итоге шага; инвариант `original_name` ↔ `number_of_seasons ||
  first_air_date` у KP-карточек без `type`) по design, решение 2. Проверка: `node --check` склейки
  `lib.js` и каждого шага. Коммит.

## 4. Verify

- [x] 4.1 `/simplify`, коммит его правок.
- [x] 4.2 `openspec validate --strict --all` и
  `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.
- [ ] 4.3 После мержа: выкатка, `bash tests/live/season-badge.sh` и `screencap` — по design.md,
  Migration Plan (правка устройства — с подтверждения пользователя).

## 5. Deliver

- [x] 5.1 `agent-process archive_change kp-bookmark-series-badge`, `gh pr create --title "fix:
  kp-bookmark-series-badge" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| card-season-badge | KP-карточка сериала | `kp card badge via resolveTitle`, `tests/live/season-badge.sh` |
| card-season-badge | KP-карточка сериала без type | `kp card badge via resolveTitle`, `tests/live/season-badge.sh` (шаг «Избранного»), 4.3 (screencap) |
| card-season-badge | KP-карточка фильма без type | `movie card no badge no request` |
| card-season-badge | Карточка tmdb или cub в «Избранном» | `core source card badge without search`, `tests/live/season-badge.sh` |
| card-season-badge | TMDB-тайтл не найден | `kp title not found grey badge` |
| card-season-badge | Сбой поиска тайтла | `kp title search failed grey badge once` |
| kp-card-trailers | Совпадение не первым результатом | `title match skips first result with other title` |
| kp-card-trailers | Совпадение по оригинальному названию | `original title matches when russian differs` |
| kp-card-trailers | Сравнение без регистра, ё и пунктуации | `title match ignores case, yo and punctuation` |
| kp-card-trailers | Сериал ищется среди сериалов | `tv card searches tv by first air date year` |
| kp-card-trailers | Сериал без type | `kp card badge via resolveTitle` (карточка без `type` и `imdb_id`) |
| kp-card-trailers | Нет года, совпадение одно | `no year single match searches without year` |
| kp-card-trailers | Нет года, совпадений несколько | `no year ambiguous title warns, no videos` |
| kp-card-trailers | Нет совпадения названия | `no title match warns with title and year` |
| kp-card-trailers | Поиск не удался | `search error warns with title and year, card opens` |
| kp-card-trailers | Год Кинопоиска на год раньше | `title search retries without year within one` |
| kp-card-trailers | Год дальше чем на 1 | `title search retry rejects year off by two` |
| kp-card-trailers | Результат без даты | `title search retry rejects undated result` |
