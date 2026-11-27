## Context

Воспроизведение, причина и стандартный подход — в proposal.md (Why, Standard approach). Требования —
в `specs/card-season-badge/spec.md` и `specs/kp-card-trailers/spec.md`.

В `plugins/kp-reactions-fix.js` сериал определяется по `type === 'tv'`. Все вызовы `resolveTitle`,
кроме `seasonOf` метки сезона, получают карточку с `type`: `KP.full` и ряды — от `convertElem` из
`kp_source.js` (строка 204: `"type": type`), рекомендации по KP-истории — с `type`, который
подставляет `isTv`. `seasonOf` берёт карточку экрана как есть, и в «Избранном» `type` у KP-карточки
нет.

**Наблюдение** (устройство, 2026-11-27, `Lampa.Favorite.get` через `cdp.py`, только чтение). KP-записи
по спискам, ни у одной нет `type`:
- `history`: 34 — без `original_name`, `first_air_date` и `number_of_seasons`; 18 — со всеми тремя;
- `book`: 3 — со всеми тремя; 1 — с `original_name` и `number_of_seasons`, без `first_air_date`;
  1 — без всех трёх;
- `like`: 4 — со всеми тремя.

Записи без `original_name` не несут и признаков сериала `isTv`: на этих данных `original_name` и
`isTv` не расходятся.

## Goals / Non-Goals

**Goals:** у KP-сериала из «Избранного» есть метка сезона; поиск TMDB для такой карточки идёт
среди сериалов.

**Non-Goals:**
- чинить сохранение `type` в закладках: это код ядра, а уже сохранённые карточки останутся без
  `type`;
- менять остальные проверки `type === 'tv'` и подстановку `type` в рекомендациях: их карточки `type`
  несут (Context).

## Decisions

### 1. Одна функция признака сериала

`isTvCard(movie)`: `movie.type ? movie.type === 'tv' : !!movie.original_name`. Её зовут
`searchByTitle` (тип поиска и год), `resolveTitle` (выбор из `find`, когда TMDB вернул и фильм, и
сериал) и ветка `KP` в `isSeries`; комментарий над `isSeries` называет правило.

`type`, когда он есть, решает: поведение карточек с `type` не меняется вовсе.

Альтернативы:
- Только `!!original_name`. На данных Наблюдения равносильно, но меняет поведение карточек с `type`,
  которое сейчас работает: в том числе рекомендаций, где `type` ставит `isTv`. Выигрыша нет: правило
  остаётся одной строкой.
- Подставить `type` в `seasonOf` перед `resolveTitle`, как рекомендации. Тогда правило жило бы в
  двух вызовах, а `isSeries` — в третьем. Одна функция закрывает класс: любой будущий вызов с
  карточкой без `type`.

Ветка `isSeries` для `tmdb`/`cub` не меняется.

### 2. Живая проверка

`kpSeries` из `tests/live/season-badge/home.js` переезжает в `SB` (`lib.js`) и повторяет правило 1;
`SB.series` для `KP` зовёт её. Шаг `bookmarks.js` требует метку на каждом KP-сериале «Избранного».
Текст не сверяется: для KP нужен поиск тайтла, повторять его в тесте — второй `searchByTitle`.
Метка `S ?` проходит, но выводится в итоге шага.

`SB.series` повторяет правило плагина и поэтому его ошибку не поймает. Ловит её отдельная проверка
того же шага: у каждой KP-карточки без `type` `!!original_name` равно
`!!(number_of_seasons || first_air_date)` — инвариант из Наблюдения. Расхождение — `Live.check` с id
карточки.

## Risks / Trade-offs

- [KP-карточка фильма без `type` с `original_name`] → она получит метку `S ?` или чужую метку.
  По коду `kp_source.js` и Наблюдению такой нет. Если появится в «Избранном», её ловит проверка
  инварианта в `bookmarks.js` (решение 2); `SB.moviesWithBadge` — нет: он судит по тому же правилу.
- [Число запросов] KP-сериалы «Избранного» теперь получают поиск и `tv/<id>`, как KP-сериалы
  Главной: каждая карточка не больше раза за сессию (memo по `source:id`). Сейчас это 6 карточек.

## Migration Plan

После мержа: снапшот `plugins` по `docs/snapshots-convention.md`, sha `kp-reactions-fix.js` →
мерж-коммит `main`, reload, подождать >20 с: WebView пишет `localStorage` с задержкой, а
`restart_lampa` в `tests/live/season-badge.sh` начинается с force-stop, который теряет
незаписанное. Затем `bash tests/live/season-badge.sh` и `screencap` «Избранного» (требование
CLAUDE.md после reload): метки на «Бегущем по лезвию 2099» и «ИИнге». Откат — `plugins` из
`before/state.json` снапшота через `Lampa.Storage.set` (`cdp.py`), reload, рестарт.
