## Context

Каталог на приставке идёт из источника `KP` (`nb557.github.io/plugins/kp_source.js`).
Свой патч `plugins/kp-reactions-fix.js` уже оборачивает `KP.full()`: находит TMDB id
через `tmdb.get('find/<imdb_id>?external_source=imdb_id')` и подставляет реакции из
`cub.reactionsGet`. Плагин подключён как `cdn.jsdelivr.net/gh/ekolvah/lampa-mediacenter@main/...`.

## Standard approach

Штатный путь движка Lampa: `tmdb.full()` добавляет в ответ `videos` (функция `videos()`
в `app.min.js`: запрос `<method>/<id>/videos` на языке `tmdb_lang` и на `en`). Модуль
`Trailers` полной карточки показывает кнопку `.view--trailer`, когда `videos.results`
не пуст. По выбору трейлера он вызывает `Android.openYoutube`, если
`player_launch_trailers == 'youtube'`, иначе `Player.play` со встроенным YouTube-мостом.
Источник: `https://github.com/yumata/lampa-source/blob/main/src/components/full/start/trailers.js`
и код того же модуля в `http://lampa.mx/app.min.js?v=1993375` на приставке.

Готовые плагины. Поиск: `gh search code "view--trailer"`, `gh search code
"Lampa.Api.sources" videos`, `gh search repos "lampa trailer"`, веб-поиск «lampa plugin
trailers», «Lampa плагин трейлеры Кинопоиск». Просмотренные кандидаты:

| Плагин | Что делает | Почему не подходит |
|---|---|---|
| `https://github.com/esemyus/lampa-plugin/blob/main/trailers_plugin.js` | Своя кнопка: TMDB `videos` по `card.id` + поиск «трейлер на русском» через Invidious `inv.nadeko.net` | Для KP-карточки `card.id` = `KP_<id>`, запрос к TMDB не найдёт тайтл. Добавляет публичный инстанс Invidious и зашитый чужой ключ TMDB. Дублирует штатную кнопку |
| `https://github.com/danifilth17/lampa/blob/main/trailers.js` | Превью из iTunes по оригинальному названию | Пропускает названия без латиницы (`/[a-z]{3}/i`), то есть большинство российских фильмов из рядов KP. Новый домен `itunes.apple.com` |
| `https://github.com/max-lampa/MAX/blob/main/yt.js` | Лента YouTube с входом через Google OAuth | Не трейлеры карточки |
| `https://github.com/lampame/main/blob/main/MovieEnhancer/MovieEnhancer.js` | Переименовывает кнопки карточки, в том числе «Трейлеры» | Видео не добавляет |
| `bylampa/bylampa.github.io/trailer_off.js`, `*/notrailer.js` | Убирают кнопку трейлеров | Обратная задача |

Готового плагина, который даёт трейлеры KP-карточкам, нет. Поэтому расширяем свой
патч, как предлагает #43, п. 3.

## Наблюдения на устройстве (2026-11-07, `cdp.py`)

1. `Object.keys(Lampa.Api.sources)` → `["tmdb","cub","KP"]`; `typeof
   Lampa.Api.sources.tmdb.videos` → `"function"`.
2. `KP.full({id:'KP_535341', method:'movie'})` → ключи `movie, persons, collection,
   simular, reactions`; `movie.imdb_id` = `tt1675434`; `videos` нет.
3. `tmdb.full({id:77338, method:'movie'})` → ключи `reactions, discuss, recomend, persons,
   movie, simular, videos, metadata`; `videos.results[0]` = `{"name":"Official
   Trailer","key":"dvdJ--DV0Uo","site":"YouTube","type":"Trailer"}`.
4. `kp_source.js` (41 617 байт): совпадения `video` только в `elem.type === 'VIDEO'`.
5. Покрытие: 16 KP-карточек Главной, `KP.full` → `find` → `tmdb.videos`. 12 из 16 имеют
   YouTube-видео (из них 11 с `ru`). У 4 нет `imdb_id` («Цикл зверя», «Лес», «Жизнь
   заново», «Зверь»). Находок `find` без видео нет.
6. Воспроизведение: `Player.play({url:'https://www.youtube.com/watch?v=OBFNnE4wU78',
   youtube:true})` (русский трейлер «Морозко» из `tmdb.videos`). Через 15 с плеер
   открыт, iframe `.player-video__youtube-bridge-frame` есть, оверлей `needclick` снят,
   блок «видео недоступно» (`.player-video__youtube-noplayed`) скрыт. `needclick`
   снимается и при состоянии `1` (playing), и при ошибке YouTube, а при ошибке показывается
   `noplayed`. Скрытый `noplayed` вместе со снятым `needclick` означает воспроизведение.
   Настройки: `player_launch_trailers` = `inner`, `tmdb_lang` = `ru`.
7. Ошибка `videos`: код `videos()` на приставке объявляет только `(params, oncomplite)`,
   ошибки обоих запросов уходят в `status.error`, а ответ кэшируется с `{life: day$1 * 7}`.
   `tmdb.videos({method:'movie', id:999999999}, ok, err)` → вызван `ok` с
   `{"results":[]}`, `err` не вызван. Сбой запроса неотличим от «видео нет».

## Goals / Non-Goals

**Goals:** кнопка «Трейлеры» в KP-карточке с тем же списком, что у карточки `tmdb`;
запуск с пульта.

**Non-Goals:**
- Трейлеры для KP-карточек без `imdb_id` (4 из 16). Есть API Кинопоиска
  `/api/v2.2/films/{id}/videos`, но ключ к нему зашит в чужом `kp_source.js`. Брать его
  в свой плагин не будем: нужен свой ключ и решение пользователя, это отдельная задача.
- Подбор тайтла в TMDB по названию и году: можно получить чужой трейлер.
- Изменение настройки «Плеер для трейлеров».

## Decisions

1. **Расширить `kp-reactions-fix.js`, а не делать отдельный плагин.** Трейлерам нужен тот
   же TMDB id, что реакциям, и один `find` служит обоим. Отдельный плагин повторил бы
   `find` и стал бы второй обёрткой `KP.full`, а порядок загрузки плагинов не
   гарантирован (комментарий в `startPlugin`). Имя файла остаётся: переименование
   добавило бы правки ссылок и ничего не дало бы поведению. Заголовочный комментарий
   описывает обе задачи.
2. **Видео через `tmdb.videos()`, а не своим запросом.** Это функция штатного источника:
   те же языки (`tmdb_lang` + `en`, параллельно), тот же прокси и кэш на 7 дней. Список
   совпадает с карточкой `tmdb` по построению, а это и требует спецификация.
3. **Один тайтл TMDB на реакции и видео.** `{method, id}` вычисляется один раз из ответа
   `find`: `movie_results[0]` → `movie`, иначе `tv_results[0]` → `tv`. Эта пара уходит и в
   `cub.reactionsGet`, и в `tmdb.videos`. Сейчас реакции берут `movie.type` из KP, хотя
   id взят из списка `find`. Если типы расходятся, реакции запрашиваются по id из чужого
   пространства (id фильмов и сериалов в TMDB независимы). Сценарий «Сериал» проверяет оба
   вызова.
4. **`find` кэшируется на 7 дней**, тем же 5-м аргументом `tmdb.get` (`{life: 7 дней}`),
   что у `videos` (наблюдение 7):
   соответствие `imdb_id` → TMDB не меняется. Без кэша повторное открытие карточки ждёт
   `find` до начала реакций и видео.
5. **Реакции и видео запрашиваются параллельно, `oncomplite` вызывается один раз,** когда
   пришли оба ответа (счётчик на два).
6. **Пустой ответ видео для найденного тайтла — предупреждение (§IV).** `tmdb.videos` не
   сообщает об ошибке: сбой запроса приходит как `{results: []}` (наблюдение 7). Поэтому
   предупреждение пишется на то, что движок действительно отдаёт: если тайтл найден, а
   `results` пуст, пишется `console.warn('kp-reactions-fix: no videos', method, id)`.
   Ответ передаётся как есть, и движок убирает кнопку. Это покрывает и сбой, и тайтл без
   видео; второе по наблюдению 5 редкость (0 из 12). Ошибка `find` сейчас проглатывается
   молча. Теперь она отнимает и трейлеры, поэтому тоже пишет `console.warn` с `imdb_id`.
   Если `tmdb.videos` не функция, вызов бросил бы исключение внутри колбэка, и карточка
   не открылась бы. Поэтому стоит проверка `typeof` с тем же `console.warn`, и ответ
   идёт только с реакциями.
7. **Тесты грузят плагин как есть (§I, §II).** `tests/js/kp-reactions-fix.test.js`
   выполняет файл плагина через `vm.runInNewContext` в контексте, где `window` — сам
   контекст, а `Lampa.Api.sources` — двойники `KP`, `tmdb`, `cub` в памяти. Так
   проверяется настоящий путь `startPlugin` → `patch`, и плагину не нужен экспорт для
   тестов. Каждый тест создаёт свой контекст, поэтому флаг `__reactions_patched` между
   тестами не переходит.
8. **Подключение по sha.** Сейчас URL плагина на `@main`, и какой код грузится, не
   зафиксировано. Приставка остаётся на sha финальной головы PR. Это тот же код, что
   squash-мерж, и коммит остаётся доступен через `refs/pull/<N>/head`. Процедура — в
   Migration / Rollback.
9. **Живая проверка `tests/live/kp-trailers.sh`.** Общие помощники `hide-cards.sh`
   (`adb_sh`, `step`, `restart_lampa`) переезжают в `tests/live/lib.sh`, а `sleep` и
   `check` из `hide-cards/lib.js` — в `tests/live/lib.js`, рядом с новым
   `waitFor(fn, ms)`. Оба сценария подключают эти файлы. `step` склеивает
   `tests/live/lib.js`, `$DIR/lib.js` (если он есть) и шаг. В `HC` остаются ссылки
   `sleep`/`check` на общие функции, поэтому шаги hide-cards не меняются. Шаги нового
   сценария:
   1) `restart_lampa`; `cdp.py` открывает `full` для `KP_535341` через
      `Lampa.Activity.push` (как `hide-cards/bookmarks-open.js`) и через `waitFor` ждёт
      `.view--trailer`;
   2) `ui.py --keys ... --expect select` доходит до кнопки «Трейлеры» и открывает список.
      Затем `ui.py --keys DPAD_CENTER` выбирает первый пункт;
   3) `cdp.py` до 20 с ждёт `.player` и iframe моста без `needclick` и без видимого
      `noplayed`, затем закрывает плеер.
   Exit 0 — всё прошло. Точные клавиши и имя контроллера списка снимаются вживую при
   реализации. Карточку без `imdb_id` проверяет юнит-тест, вживую её не проверяем.
   Один `screencap` во время воспроизведения делается в задаче, а не в скрипте: вопрос
   визуальный (идёт ли видео).

## Risks / Trade-offs

- **Первое открытие карточки ждёт `find`, а потом самый медленный из ответов: реакции
  или `videos`.** Повторные открытия берут `find` и `videos` из кэша.
- **Движок поменяет модуль `Trailers` или уберёт экспорт `videos`.** `app.min.js`
  обновляется на приставке сам, и никакой гейт в этот момент не запускается. Отсутствие
  функции даёт `console.warn` (решение 6), но поломку заметит только человек: по
  пропавшей кнопке или запустив `bash tests/live/kp-trailers.sh`.
- **YouTube-мост встроенного плеера зависит от `github_lampa/youtube.html`.** Это
  штатный путь движка, мы его не меняем. Наблюдение 6 показало, что он работает.
- **До мержа приставка работает на sha ветки.** Sha коммита неизменен, и живая проверка
  его подтвердила. Если PR не примут, откат такой же, как ниже.

## Migration / Rollback

1. Живая проверка: снапшот по `docs/snapshots-convention.md`, затем через `cdp.py` URL
   `.../lampa-mediacenter@main/plugins/kp-reactions-fix.js` меняется на
   `@<sha головы ветки>`, затем `bash tests/live/kp-trailers.sh` (Lampa он рестартует
   сам). Если корректирующий пуш меняет `plugins/kp-reactions-fix.js`, это повторяется
   на новой голове. Приставка остаётся на sha финальной головы PR (решение 8).
2. Перепривязку на `@<merge sha>` после мержа агент не делает: его работа кончается до
   мержа. Она остаётся пользователю как необязательный шаг из итогового сообщения.
3. Откат: URL на `@fbad1a9d24366c6d5bcfa8d56e7f41f24d6ba46f`, последний коммит плагина
   до этой задачи, затем рестарт. Вернуть `@main` из снапшота нельзя: после мержа он
   указывает на новый код.
