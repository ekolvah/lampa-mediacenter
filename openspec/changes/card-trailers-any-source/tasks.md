## 0. Delivery start

- [x] 0.1 `agent-process start_change card-trailers-any-source --planner Claude --implementer Claude`
  (tracking issue 94), дальше работа в `.claude/worktrees/card-trailers-any-source`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js` (design.md, решение 4):
  - двойники `tmdb.full`, `cub.full` в `load()` отвечают `{ movie: opts.movie, videos: opts.videos,
    reactions: opts.reactions }`, помощник теста открывает ими карточку (`{ id, method }`);
  - `drop` принимает путь любой глубины (`Api.sources.cub.full`);
  - фикстура `BLACK_LOTUS` — `movie` из наблюдения 4 design.md (`type: 'Scripted'`, `name`,
    `original_name`, `first_air_date: '2021-11-14'`).
  Открытие KP-карточки в `load()` и прежние тесты не меняются.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Обёртки `tmdb.full` и `cub.full` (решение 1)

- [x] 2.1 В `startPlugin()` присвоить `cub`, `tmdb` (из `patch()` присваивания убрать, проверку
  `!cub || !tmdb` оставить); нет `tmdb.full`, `cub.full`, `tmdb.videos` или `tmdb.get` — один
  `console.error` с именами, без обёрток. Проверка: `node --test tests/js/kp-reactions-fix.test.js`,
  тест «no cub.full: one error, tmdb card as is, KP card unchanged».
- [x] 2.2 Одна функция оборачивает `tmdb.full` и `cub.full`: тайтл `{method: params.method, id:
  result.movie.id}`, у сериала `lastSeason`, затем `trailers(result, title, result.videos, season,
  …)`; результат без `movie` — движку как есть, как в `KP.full`. Проверка: та же, тесты «tmdb and cub card: service video first, no title search», «tmdb
  series season 2: service asked with season», все прежние тесты зелёные.

## 3. Помощники названия и даты (решение 2)

- [x] 3.1 `cardName` — `title || name || original_title || original_name`; оригинальное название —
  `original_title || original_name`; `releaseDate(movie, tv)` с признаком от вызывающего. Проверка:
  та же, тест «tmdb and cub card: service video first, no title search» сверяет `title`,
  `original_title`, `year=2021` в URL сервиса; тесты рядов «Сейчас смотрят» зелёные. Коммит групп 2–3.

## 4. Доки

- [x] 4.1 Шапка `plugins/kp-reactions-fix.js` (трейлеры — у карточек KP, `tmdb`, `cub`);
  `docs/lampa-config-review.md`, строка `kp-reactions-fix.js`: русский трейлер и трейлер сезона у
  карточек `tmdb`/`cub` с тайтлом из карточки; `docs/jacred-on-ugoos.md:49` — «русский трейлер
  карточки» вместо «KP-карточки»; Purpose `openspec/specs/kp-card-trailers/spec.md` — трейлеры
  карточек `tmdb`/`cub` (решение 3). Проверка: `python scripts/ci_check.py --only links`. Коммит.

## 5. Живая проверка: скрипты

- [ ] 5.1 `tests/live/kp-trailers/lib.js`: `kpFull` → `cardFull(params)` через `Lampa.Api.full`,
  `openCard(params)` для любой карточки, `askService` берёт `name`/`original_name` и год по
  `params.method`; общая проверка «первым — ролик сервиса» (`iso_639_1` `ru`, `key` = `video_id`,
  `window.__kpRuTrailer`), её зовут `open-card-no-imdb.js` и новый `open-card-tmdb.js` («Чёрный
  лотос», `tmdb`, `tv/84553`). В `tests/live/kp-trailers.sh` — блок «Чёрный лотос» с
  `play_trailer_button`. Коммит.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит его правок.
- [ ] 6.2 Снапшот пина по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha ветки,
  `bash tests/live/kp-trailers.sh` → `OK`, затем `screencap` карточки «Чёрного лотоса» (процесс уже
  перезапущен скриптом).
- [ ] 6.3 `openspec validate --strict --all`.
- [ ] 6.4 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change card-trailers-any-source`, `gh pr create --title "fix:
  card-trailers-any-source" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Scenario | Test |
| --- | --- |
| Русский трейлер карточки TMDB | `tmdb and cub card: service video first, no title search` |
| Последний сезон карточки TMDB | `tmdb series season 2: service asked with season` |
| Источник без full | `no cub.full: one error, tmdb card as is, KP card unchanged` |
| Русский трейлер карточки TMDB с пульта | `tests/live/kp-trailers.sh` (шаг `kp-trailers/open-card-tmdb.js`, блок «Чёрный лотос») |
