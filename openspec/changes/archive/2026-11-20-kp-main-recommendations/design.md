## Context

`kp-reactions-fix.js` уже оборачивает `KP.main`: `filterRows` заменяет в первой порции Главной ряды
«Сейчас смотрят» новинками и отдаёт её не позже `ROWS_TIMEOUT_MS = 5000` (spec
`now-watching-new-releases`). Там же живёт проход по KP-истории (#77, `historyRecs`): он вычищает
найденные TMDB-тайтлы KP-записей из `recomends_list` на месте (`cleanRecs`).

## Standard approach

**Код ядра.** `http://lampa.mx/app.min.js`, скачан с ПК 2026-11-20, модуль совпадает с
`yumata/lampa-source` `src/core/recomend.js`
(https://github.com/yumata/lampa-source/blob/main/src/core/recomend.js).

- Ряд ядра — `ContentRows.add({name: 'recomend_watch', index: 1, screen: ['main', 'category'], …})`.
  Его `call`: `media = screen == 'main' ? 'movie' : params.url`, `results = Arrays.shuffle(all).slice(0,
  20)`, `total_pages = Math.ceil(all.length / 20)`, пустой — `return` без ряда, «Ещё» —
  `params.emit.onlyMore` → `router.call('recomend', {media, total_pages})`. На Главной ядро
  показывает только фильмы.
- `ContentRows.call('main', params, parts_data)` есть только в `main` источников `tmdb` и `cub`
  (в бандле 2 вызова).
- `get$4(type)` = экспортированный `Lampa.Recomends.get`. Он берёт
  `Storage.get('recomends_list', '[]')`, фильтрует по типу
  (`number_of_seasons || first_air_date` — сериал), делает `.reverse()` и убирает тайтлы, чей `id`
  есть в истории (`history.find(h => h.id == e.id)`).
- Экран «Ещё»: маршрут `recomend` (`media: data.media || 'movie'`) листает `Recomends.page`, тот
  берёт `get$4(object.media)`. Карточка открывается через `router.call('full', data)` с `source:
  data.source || Storage.field('source')`. `window.Lampa` экспортирует `Router` и `Recomends`.
- Источник карточки: ответы TMDB проходят `Utils.addSource(json, 'tmdb')`
  (`if (!item.source) item.source = source`). На приставке 2026-11-20
  `Lampa.Storage.get('recomends_list')` → 114 записей, `sources: {tmdb: 114}`, при
  `Storage.field('source') === 'KP'`. Значит, карточки ряда и «Ещё» откроются через TMDB.

**`kp_source`** (`https://nb557.github.io/plugins/kp_source.js`, скачан 2026-11-20). `main$1` —
11 рядов коллекций Кинопоиска, `parts_limit = 5`, вызова `ContentRows` нет. `category` для
`movie`/`tv` строит «Рекомендуем посмотреть» сам:
`Lampa.Arrays.shuffle(Lampa.Recomends.get(params.url)).slice(0, 19)`, без `total_pages` и «Ещё».

**Замер гонки на приставке, 2026-11-20** (`tools/cdp.py`, после `restart_lampa`):
- Resource Timing: `kp-reactions-fix.js` загружен к 3889 мс от старта страницы. Коллекции
  «Сейчас смотрят» пришли за 5203–5990 мс, последний запрос к `kinopoiskapiunofficial.tech` — к
  7547 мс. Запросов `find/` и `search/` к TMDB нет: проход по истории целиком взят из кэша движка.
- Тот же ряд из 27 `tmdb.get('find/<imdb_id>?external_source=imdb_id')` по одному, из кэша:
  `{"n":27,"total":2663,"max":234}` мс. Кроме них проход делает ~10 поисков по названию.
- Значит, даже из кэша проход идёт ~3–4 с после готовности приложения. Это пересекается со сборкой
  первой порции (~5–7,5 с). Без кэша (раз в неделю) проход занимает до `RECS_TIMEOUT_MS = 60000`.

**Готовые решения** не нашлись. GitHub code search 2026-11-20 по `Lampa.Recomends` даёт только
форки `kp_source` (`nb557/plugins`, `amikdn`, `BazZziliuS`, `hoprop/tmdb`, `dzh5`, `lvPokka`,
`sb1969vb`), и все зовут `Recomends.get` только в `category`. По `title_recomend_watch` и
`ContentRows.call main` находится только сам `yumata/lampa(-source)`.

## Goals / Non-Goals

**Goals:** на Главной KP есть ряды рекомендаций обоих типов с «Ещё», без просмотренного.

**Non-Goals:**
- KP-тайтлы, запущенные в этом же сеансе после прохода. Они уйдут из рекомендаций при следующем
  запуске: проход идёт раз за запуск (spec `kp-history-recommendations`). Менять это — правка #77.
- Свой экран «Ещё» и своя выборка: используется то, что даёт ядро.

## Decisions

### 1. Два ряда в обёртке `KP.main`, а не через `ContentRows`

Состав рядов выбрал пользователь: два ряда с «Ещё». Ряд типа собирается из одного вызова
`Lampa.Recomends.get(type)` (`all`) по образцу объекта ядра: `results =
Lampa.Arrays.shuffle(all).slice(0, REC_ROW_LIMIT)`, `total_pages = Math.ceil(all.length / 20)`, `page: 1`,
`params.emit.onlyMore` → `Lampa.Router.call('recomend', {media, total_pages})`. Заголовки —
«Рекомендуем посмотреть фильмы» и «Рекомендуем посмотреть сериалы».

`REC_ROW_LIMIT = 40` выбрал пользователь, у ядра 20. `total_pages` считается по 20: это страницы
экрана «Ещё» (`Recomends.page`), а не ряда, поэтому делитель ядра не меняется.

Отвергнуто:
- «Звать `ContentRows.call('main', …)` из обёртки». Ряд ядра на Главной — только фильмы, встаёт по
  `index: 1`, и в порцию попадут ряды других плагинов для `main`.
- «Ряд через `ContentRows.add` с `screen: ['main']`». `kp_source` его не вызовет.
- «`recomends_list` напрямую». `Recomends.get` уже фильтрует по типу и по истории `tmdb`/`cub`.

### 2. Место — за рядами «Сейчас смотрят»

Место выбрал пользователь. Его считает обёртка по исходной порции: ряды встают перед первым рядом
после последнего ряда `NOW_WATCHING`. Это ряд не из `NOW_WATCHING`, и в выход `filterRows` он
попадает тем же объектом. Поэтому место не зависит от того, показан ли ряд новинок и какую ветку
прошёл `filterRows`. Если за `NOW_WATCHING` рядов нет, рекомендации встают в конец. Если рядов
`NOW_WATCHING` нет совсем, рекомендации встают первыми. `filterRows` о рекомендациях не знает.

### 3. Один `waiter` на первую порцию, ожидание прохода — его слот

Ряд, собранный до конца прохода, может показать KP-тайтл, который проход потом уберёт из
`recomends_list` (замер выше). Поэтому обёртка `KP.main` при первой порции заводит один
`waiter(done, ROWS_TIMEOUT_MS)`. Это уже N-сторонний сбор под общим сроком, как в `listBatch`.
- `filterRows(parts, pending)` по образцу `collectPages` возвращает `build()` → ряды порции с
  новинками. В ветке «нет рядов `NOW_WATCHING`» он зовёт `rowsFailed` и возвращает `build`, который
  отдаёт `parts` как есть.
- Ожидание прохода — один `pending()` того же `waiter`, если проход не закончен. Проход получает
  признак конца: флаг `historyDone` и список колбэков. Список, а не один слот: `KP.main` зовётся
  при каждом открытии Главной (комментарий у обёртки), и повторное открытие из меню во время
  холодного прохода — второй ждущий. Признак ставится в `done` `waiter` прохода и сразу, если
  KP-истории нет. Список очищается после вызова, поэтому колбэк ушедшей Главной не держится
  дольше прохода. Поздний колбэк `waiter` и так отбрасывает.
- `done` обёртки зовёт `build()`, ставит ряды рекомендаций по решению 2 и отдаёт порцию Главной.
  Если к этому моменту `historyDone` нет, к заголовкам добавляется « · неполный» (литерал один на оба
  места — общая константа с `filteredRow`) и пишется
  `console.warn('kp-reactions-fix: recommendations: KP history not resolved before main')`.

Срок остаётся прежним, 5 с. Новых таймеров и своей склейки нет.

Отвергнуто:
- «Второй `waiter` на проход и склейка "оба готовы" в обёртке». Два срока на один бюджет и свой
  счётчик рядом с уже имеющимся в `waiter`.
- «Ряды по своему `Set` ключей из прохода». Закончившийся проход уже вычистил `recomends_list`, а
  до его конца `Set` пуст.
- «Хранить ключи KP-истории между запусками в Storage». Новые записи истории всё равно ждали бы
  прохода, а ключу нужна своя инвалидация (решение 2 архивного
  `2026-11-20-kp-history-recommendations/design.md`).
- «Ждать без предела». Проход без кэша идёт до 60 с, всё это время Главная была бы пуста.
- «Параллелить проход, раз Главная его ждёт». Это правка поведения #77 («не залпом поверх рядов
  Главной»). По замеру тёплый проход и так кончается раньше последних запросов новинок.

### 4. Пустой тип и сбой видны

Если `Recomends.get(type)` пуст, ряда нет и пишется
`console.warn('kp-reactions-fix: no recommendations', type)`. Один раз при установке обёртки, рядом
с проверкой `orgMain`, проверяются функции ядра, на которых строятся ряды: `Lampa.Recomends &&
Lampa.Recomends.get`, `Lampa.Router && Lampa.Router.call`, `Lampa.Arrays && Lampa.Arrays.shuffle`.
Проверка без исключения при отсутствии объекта, поэтому обёртка `KP.main` и проход по истории
ставятся всё равно. Если чего-то нет (ядро сменило экспорт), `recsFailed(reason)` с именами
недостающих показывает `Lampa.Noty` («Ряды рекомендаций не построены: …») и пишет `console.error`.
Обёртка тогда рекомендаций не добавляет, ряды новинок и `rowsFailed` не меняются.

## Risks / Trade-offs

- [40 карточек вместо 20 в двух рядах] → Главная на приставке рисует больше карточек. Живая
  проверка (группа 5) смотрит ряды на приставке и `screencap` после неё.

- [Без кэша движка проход дольше 5 с] → примерно раз в неделю ряды с « · неполный» и
  предупреждением. В них может быть KP-тайтл из истории, при следующем запуске его уже нет.
- [Ядро перестанет ставить `source: 'tmdb'` записям `recomends_list`] → карточки откроются через
  `KP.full` с числовым id. Живая проверка смотрит `source` карточек, но ядро обновляется само,
  поэтому смена ловится только при её запуске.
- [Новая версия ядра уберёт `Recomends.get`, `Router.call` или `Arrays.shuffle`] → сбой виден при
  запуске (решение 4).
- [Новая версия ядра уберёт или переименует маршрут `recomend`] → «Ещё» молча не откроется. Это
  принятый пробел, как у `source` выше: ядро обновляется само, независимо от пина, и
  `Router.call` с неизвестным маршрутом снаружи не отличить. Ловит только живая проверка при её
  запуске.

## Migration Plan

После merge пин `kp-reactions-fix.js` на приставке переводится на sha `main`, со снапшотом по
`docs/snapshots-convention.md`. Плагин ничего нового не пишет в Storage. Откат — вернуть прежний sha.
