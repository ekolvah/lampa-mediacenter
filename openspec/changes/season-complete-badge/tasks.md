## 0. Delivery start

- [x] 0.1 `agent-process start_change season-complete-badge --planner Claude --implementer Claude`
  (tracking issue 116), дальше работа в `.claude/worktrees/season-complete-badge`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: двойники по design, решение 8 (`Maker.map('Card')`
  с `Card.onVisible`, пишущим вызовы в `calls.visible`; карточка и `document` — по образцу
  `tests/js/torrent-quality-badge.test.js`), тесты — модульные из «Scenario → test map», которых ещё нет. Прежние тесты `kp-card-trailers` остаются, кроме двух помеченных в карте «(обновить)»:
  `no title match warns with title and year` — ответ поиска по году с результатами без совпадения
  названия, `c.get` — URL с годом, затем URL без года; `search error warns with title and year, card
  opens` — в `c.get` только URL с годом.
  `missing card hook fails visibly` — цикл по `drop` для `Maker.map` и `Card.onVisible`; что Главная
  KP и закладки работают, проверяют существующие проверки `patch`/`patchFavorites` в том же `load()`.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 Раздел «Метка сезона» в `plugins/kp-reactions-fix.js` по design, решения 2–7 (включая
  расширение `lastSeason`, `cb(null, 'error')` у `resolveTitle`/`searchByTitle` и повтор поиска без
  года в `searchByTitle` по delta `kp-card-trailers`), вызов из
  `startPlugin()`, абзац в шапке. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js` зелёный, включая прежние тесты. Коммит.

## 3. Живая проверка

- [x] 3.1 `tests/live/season-badge/badges.js` и `tests/live/season-badge.sh` по design, решение 8
  (`restart_lampa`, `step badges` из `tests/live/lib.sh`; `Live.waitFor`, `Live.check` из
  `tests/live/lib.js`; в шапке — когда гонять: перед сменой sha `plugins/kp-reactions-fix.js` и
  после). Только чтение. Коммит.

## 4. Доки

- [x] 4.1 Строка `kp-reactions-fix.js` в `docs/lampa-config-review.md`: метка сезона на карточках
  сериалов, повтор поиска по названию без года (±1, без даты не берётся), живая проверка — `bash tests/live/season-badge.sh`. Проверка:
  `python scripts/ci_check.py --only links`. Коммит.

## 5. Verify

- [x] 5.1 `/simplify`, коммит его правок.
- [ ] 5.2 `openspec validate --strict --all` и
  `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`, до выкатки.
- [ ] 5.3 Выкатка и `screencap` — по design.md, Migration Plan.

## 6. Deliver

- [ ] 6.1 `agent-process archive_change season-complete-badge`, `gh pr create --title "feat:
  season-complete-badge" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| card-season-badge | Сезон выходит | `season airing badge` |
| card-season-badge | Сезон вышел целиком | `season complete badge`, `tests/live/season-badge.sh` |
| card-season-badge | Объявлен следующий сезон | `next season announced complete` |
| card-season-badge | Число серий сезона неизвестно | `season total unknown` |
| card-season-badge | Фильм | `movie card no badge no request`, `tests/live/season-badge.sh` |
| card-season-badge | Сериал без вышедших серий | `series without aired episode no badge` |
| card-season-badge | KP-карточка сериала | `kp card badge via resolveTitle`, `tests/live/season-badge.sh` (шаг Главной KP), 5.3 (screencap) |
| card-season-badge | Карточка tmdb или cub в «Избранном» | `core source card badge without search` (цикл по `tmdb`, `cub`), `tests/live/season-badge.sh` |
| card-season-badge | TMDB-тайтл не найден | `kp title not found grey badge` |
| card-season-badge | Сбой поиска тайтла | `kp title search failed grey badge once` (цикл по сбою `find` и `search`) |
| card-season-badge | Повторный показ | `repeat visible no new request`, `tests/live/season-badge.sh` |
| card-season-badge | Одновременные карточки одного сериала | `same card id two cards one request` |
| card-season-badge | Сбой запроса сведений | `tv details failed grey badge once` |
| card-season-badge | Нет хука карточки | `missing card hook fails visibly`, `core onVisible still runs` |
| kp-card-trailers | Совпадение не первым результатом | `title match skips first result with other title` |
| kp-card-trailers | Совпадение по оригинальному названию | `original title matches when russian differs` |
| kp-card-trailers | Сравнение без регистра, ё и пунктуации | `title match ignores case, yo and punctuation` |
| kp-card-trailers | Сериал ищется среди сериалов | `tv card searches tv by first air date year` |
| kp-card-trailers | Нет года, совпадение одно | `no year single match searches without year` |
| kp-card-trailers | Нет года, совпадений несколько | `no year ambiguous title warns, no videos` |
| kp-card-trailers | Нет совпадения названия | `no title match warns with title and year` (обновить) |
| kp-card-trailers | Поиск не удался | `search error warns with title and year, card opens` (обновить) |
| kp-card-trailers | Год Кинопоиска на год раньше | `title search retries without year within one` |
| kp-card-trailers | Год дальше чем на 1 | `title search retry rejects year off by two` |
| kp-card-trailers | Результат без даты | `title search retry rejects undated result` |
