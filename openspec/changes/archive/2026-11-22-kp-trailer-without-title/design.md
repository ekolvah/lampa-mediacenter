## Context

Обёртка `KP.full` в `plugins/kp-reactions-fix.js` получает ответ `kp_source`, находит TMDB-тайтл
(`resolveTitle`: `find` по `imdb_id`, затем `search/movie|tv` по названию) и при найденном тайтле
вызывает `enrich`: реакции, видео TMDB и через `trailers` — ролик сервиса. Если `resolveTitle`
вернул `null`, ответ уходит движку как есть. Тогда движок не рисует `.view--trailer`, и кнопки
«Трейлер» нет (`trailerButton`).

`ruTrailer(movie, tv, season, cb)` собирает запрос из названия, оригинального названия и года
карточки. TMDB-тайтл ему не нужен. `putFirst(video, date, list)` ставит ролик первым по ключам
сортировки движка.

Наблюдения на приставке 2026-11-22 (`tools/cdp.py`):

1. Из 46 KP-карточек истории без тайтла не осталось ни одной. Из KP-карточек 7 рядов Главной
   (285 карточек вместе с TMDB-рядом рекомендаций) через настоящий `KP.full` без тайтла остались
   6, у всех причина `not found`, видео в ответе 0: `KP_14897335` «Буду рядом», `KP_11703254`
   «Мосгаз. Дело № 12» (без даты), `KP_8941010` «Огонь», `KP_9807115` «Хартленд», `KP_8426882`
   «Лучшее лето в жизни», `KP_1435087` «Монстры» (`imdb_id` `tt13207736`, но и `find`, и поиск
   пусты).
2. Сервис на запросы плагина ответил роликом по всем 6. Ролики «Буду рядом» (`cnF03C1vYmA`) и
   «Мосгаза» (`F2FcNu__MBQ`, «Дело №12: Южный порт») — правильные. Ролики «Хартленда» («20-й
   сезон» канадского сериала для фильма 2026 года), «Огня» (финальный трейлер фильма 2020 года для
   сериала 2025 года) и «Монстров» (английский трейлер «The Lizzie Borden Story») — чужие.
3. Ответ `kp_source` на эти карточки не несёт видео (`result.videos` пуст), так что ролик сервиса
   будет в списке единственным.

## Standard approach

none found: поиск «lampa плагин русский трейлер youtube карточка» в change `card-trailers-any-source`
(design.md, Standard approach) готового плагина не дал, тогда же выбран свой сервис трейлеров
(`docs/jacred-on-ugoos.md`). Здесь переиспользуются только уже существующие части плагина: обёртка
`KP.full` и `trailers`.

## Goals / Non-Goals

**Goals:**

- KP-карточка без TMDB-тайтла получает русский трейлер сервиса, если он есть, и кнопку «Трейлер».

**Non-Goals:**

- Точность подбора ролика: сервис не сверяет год и тип, отсюда 3 чужих ролика из 6 (наблюдение
  2). Это библиотека `ekolvah/trailer-search`, и с карточками, у которых тайтл найден, она
  ошибается так же. Решение пользователя (2026-11-22): отдельный issue в той библиотеке, плагин
  роликов не фильтрует.
- Реакции без TMDB-тайтла: их ключ — TMDB id.
- Трейлер последнего сезона без тайтла: N берётся из TMDB `tv/<id>`.
- Почему у «Монстров» `find` по `tt13207736` пуст: вне issue.

## Decisions

### 1. `trailers` с пустым тайтлом, а не отдельная ветка

Если `resolveTitle` вернул `null`, обёртка `KP.full` вызывает `trailers(result, null,
result.videos, null, function () { oncomplite(result); })`. В `trailers` две правки под пустой
тайтл:

- тип для запроса — `title ? title.method === 'tv' : movie.type === 'tv'` (как в
  `searchByTitle`: у сериала год из `first_air_date`);
- предупреждение «no videos» пишется только при тайтле: без тайтла причину уже назвал
  `resolveTitle`, а `title.method`/`title.id` взять неоткуда.

`season` пуст, поэтому `seasonTrailer` не вызывается. Остальное — общее с карточкой с тайтлом:
выход при русском видео в списке, `putFirst` поверх видео ответа `kp_source` (обычно пусто,
наблюдение 3), при отказе сервиса — ответ как есть и предупреждение `ruTrailer`.

Альтернатива: отдельная ветка в обёртке (`ruTrailer` + `putFirst` + `oncomplite`). Отклонена: она
повторяет ядро `trailers` (`ruTrailer` → `putFirst` → `done`), и любая правка вставки ролика
делалась бы в двух местах.

### 2. Предупреждение о сбое `find`

Текст `find failed, no reactions and trailers` меняется на `find failed, no reactions`: трейлер
теперь может прийти от сервиса.

### 3. Тесты

В `tests/js/kp-reactions-fix.test.js`:

- Карточка — `show('Буду рядом', '2026')` (фабрика уже есть), URL сервиса — константа рядом с
  `SERVICE_URL` и сверяется целиком через `deepStrictEqual(c.service, [{ url, timeout: 10000 }])`.
- «no title: service video only, no tmdb videos or reactions»: `search: NO_RESULTS`,
  `service: PICK`; `plain(c.done[0].videos.results)` равно `[PICK_VIDEO]`, `reactions` нет,
  `c.videos` и `c.reactions` пусты.
- «no title, service gave nothing: answer as is, warning»: таблица исходов из «service null, error
  or timeout» выносится в константу и проходится для этой карточки; `videos` undefined,
  `warnedWith(c, 'Буду рядом', '2026', needle)`.
- «find error warns with imdb_id, card opens» получает `service: PICK` и проверяет, что ролик
  сервиса первый; предупреждение остаётся одно.
- `assertWarnedNoTrailers` переименовывается в `assertNoTmdbTitle` и проверяет предупреждение через
  `warnedWith`, а не `assertWarned`: сервис по умолчанию в тестах отвечает пусто, и появляется
  второе предупреждение. Его три теста («no year ambiguous title warns, no videos», «no title
  match warns with title and year», «search error warns with title and year, card opens»)
  остаются без других правок; что сервис спрошен, проверяют тесты выше.

### 4. Живая проверка на «Буду рядом»

Шаг `tests/live/kp-trailers/open-card-no-title.js` открывает `KP_14897335` через `cardFull`.
Перед `serviceFirst` и `openCard` (`lib.js`) он проверяет, что тайтл по-прежнему не найден
(`!('reactions' in full)`: `enrich` присваивает ключ при любом ответе `reactionsGet`). Как только TMDB добавит этот сериал, шаг упадёт с сообщением
«нашёлся TMDB-тайтл: выбрать другую карточку из `no title match`». Тот же приём использует
`open-card-no-imdb.js` для `imdb_id`. В `tests/live/kp-trailers.sh` добавляется блок «Буду
рядом» с `play_trailer_button`.

## Risks / Trade-offs

- [Чужой ролик у карточки без тайтла] → пользователь видит трейлер не того фильма (Non-Goals).
  Без тайтла других видео нет, ошибку не перекрыть. Митигация — issue в библиотеке:
  [ekolvah/trailer-search#16](https://github.com/ekolvah/trailer-search/issues/16). Повторный
  запрос вечером 2026-11-22 дал «Хартленду» правильный ролик (`xY_08xAt4wI`): выбор зависит от
  выдачи YouTube, «Огонь» и «Монстры» по-прежнему с чужими.
  Фильтр в плагине отклонён: он дублировал бы логику библиотеки и отсекал бы правильные ролики без
  года в названии («Мосгаз»).
- [Лишний запрос к сервису] → при каждом открытии такой карточки. Сервис кэширует на 24 часа и
  ролик, и `video_id: null` (`CachedFinder`, `tools/trailer_service.py`), так что повторное
  открытие — попадание в кэш. Первое открытие ждёт `find`/`search` и поиск сервиса последовательно
  (до 10 секунд, `TRAILER_TIMEOUT_MS`), как у карточек с тайтлом без русского видео. Звать сервис
  параллельно с `resolveTitle` не стали: запрос уходил бы и для ~98% карточек, где тайтл найдётся.
- [Пример для живой проверки исчезнет] → шаг 4 падает с понятным сообщением, кандидатов выдаёт
  `no title match` в консоли Главной.

## Migration Plan

`/simplify` до живой проверки. Снапшот пина по `docs/snapshots-convention.md`, пин
`kp-reactions-fix.js` на sha ветки, `bash tests/live/kp-trailers.sh`. Последним шагом перед
отчётом — перезапуск Lampa и `screencap` карточки «Буду рядом»: скрипт перезапускает Lampa в
начале, до шагов `cdp.py`, а не после. После мержа — пин на sha `main`. Откат: пин из снапшота, в репозитории — revert PR.
