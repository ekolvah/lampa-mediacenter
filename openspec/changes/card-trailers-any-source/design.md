## Context

После `separate-card-module` (#93) в `plugins/kp-reactions-fix.js` три модуля: «Общее» (сравнение
названий, `resolveTitle`, `lastSeason`), «Карточка» (`enrich`, `trailers`, `ruTrailer`,
`seasonTrailer`, кнопки) и «Источник KP» (`patch()`: обёртки `KP.full`, `KP.main`, `KP.list`).
Модуль карточки зовётся только из обёртки `KP.full`. `cub` и `tmdb` присваивает `patch()`, а
`patch()` ждёт появления источника KP.

Наблюдения на приставке 2026-11-21 через `tools/cdp.py`, движок не менялся, обёртки-счётчики
снимались после замера (проверено: в исходном коде функций нет текста счётчика):

1. Счётчик на `Lampa.Api.full`, затем `Lampa.Activity.push({component: 'full', id: 84553,
   method: 'tv', source: 'tmdb'})`: вызван с `{source: 'tmdb', method: 'tv', id: 84553}`, колбэк
   получил `movie.id` 84553 и 5 видео, в карточке есть `.view--trailer`.
2. Карточки из истории открыты маршрутом движка `Lampa.Router.call('full', card)`: TMDB-сериал —
   `{source: 'tmdb', method: 'tv', id: 213375}`, `movie.type` `Miniseries`; KP-сериал —
   `{source: 'KP', method: 'tv', id: 'KP_2000102'}`, `movie.type` `tv`.
3. `Object.keys(Lampa.Api.sources)` — `tmdb, cub, KP`. В истории 36 записей KP, 19 `tmdb`, 4 `cub`.
4. `tmdb.full` сериала 84553: ключи ответа `movie, persons, recomend, simular, videos, episodes,
   reactions, discuss`; `movie` — `{type: 'Scripted', name: 'Бегущий по лезвию: Чёрный лотос',
   original_name: 'Blade Runner: Black Lotus', first_air_date: '2021-11-14', imdb_id: 'tt9359796'}`,
   поля `title` нет. Фильм 78: `title`, `original_title`, `release_date`, `type` нет.
5. `cub.full` сериала 206916: ключи `recomend, reactions, discuss, persons, videos, simular, movie,
   episodes`, `movie.id` 206916 (TMDB id, `type: 'Scripted'`), 7 видео.
6. Счётчики на `sources.tmdb.full`, `sources.cub.full` и `Lampa.Api.full`, затем
   `Router.call('full', …)` TMDB-сериала 213375 из истории, назад, `Router.call('full', …)`
   cub-сериала 206916 «Тёмное дитя: Отголоски», назад, 3,5 с на Главной. Записи по порядку:
   `{api: 'tmdb', method: 'tv', id: 213375}`, `{src: 'tmdb', method: 'tv', id: 213375}`,
   `{api: 'cub', method: 'tv', id: 206916}`, `{src: 'cub', method: 'tv', id: 206916}`, в карточке
   cub есть `.view--trailer`; на возврате и на Главной вызовов нет. Значит, диспетчер берёт `full`
   источника в момент вызова (так же уже работает обёртка `KP.full`), `method` карточки cub —
   метод TMDB, а `full` источника зовёт открытие карточки.

## Standard approach

none found: поиск «lampa плагин русский трейлер youtube карточка Lampa.Api.full» — готового плагина
Lampa с русским трейлером для карточки нет, выдача не о Lampa-плагинах трейлеров. Свой
сервис трейлеров уже есть (`docs/jacred-on-ugoos.md`). Приём — обёртка `full` источника — плагин
уже применяет к `KP.full` (и к `KP.main`, `KP.list`, `Lampa.Recomends.get`).

## Goals / Non-Goals

**Goals:**

- Русский трейлер и трейлер последнего сезона у карточек `tmdb` и `cub` по правилам KP-карточки.
- KP-карточка без изменений: её обёртка и `enrich` не трогаются.

**Non-Goals:**

- Реакции и видео карточек `tmdb`/`cub` — их даёт источник.
- Источники, которых на приставке нет.

## Decisions

### 1. Обёртки `tmdb.full` и `cub.full`

Модуль «Карточка» в `startPlugin()`, до ожидания KP, присваивает `cub`, `tmdb` (источники ядра, KP
для них не нужен; из `patch()` эти два присваивания уходят, его проверка `!cub || !tmdb` остаётся)
и оборачивает `full` обоих одной функцией: исходный `full`, в его колбэке — трейлеры, затем
результат движку, до отрисовки (наблюдение 6). Тайтл — `{method: params.method, id:
result.movie.id}`: у `tmdb`/`cub` id карточки и есть TMDB id (наблюдения 4–6). Видео —
`result.videos`; у сериала `lastSeason`, затем существующий `trailers`. `KP.full` и `enrich` не
меняются.

Обёрткам нужны `tmdb.full`, `cub.full`, `tmdb.videos` (`seasonTrailer`) и `tmdb.get`
(`lastSeason`). Нет любой из них — один `console.error` с именами, обёрток нет, карточки
`tmdb`/`cub` открываются как есть (§IV). KP-карточку это не задевает: у неё свои проверки в
`enrich` и `patch()`.

Альтернатива — обёртка диспетчера `Lampa.Api.full` для карточки любого источника. Ей нужен
переданный из `KP.full` тайтл (`tmdb_title`) и вынос ожидания сезона из `enrich`; у KP-сериала
`tv/<id>` шёл бы после видео, а не параллельно; не-TMDB id источника без `tmdb_title` ушёл бы в TMDB.
Сценариям change нужны только `tmdb` и `cub`. Событие `full`/`complite` — после отрисовки, список
«Трейлеры» уже собран движком.

### 2. Помощники названия и даты понимают поля TMDB

У сериала TMDB нет `title`, а `type` — тип сериала TMDB (`Scripted`, `Miniseries`), не `tv`
(наблюдение 4): `cardName`, `releaseDate` и `original_title` в `ruTrailer` дали бы пустые название,
год и оригинальное название. Помощники обобщаются, а не обходятся копией карточки в форме KP:

- `cardName` — `title || name || original_title || original_name`, как уже сравниваются
  результаты поиска TMDB в `searchByTitle`;
- оригинальное название — `original_title || original_name`;
- `releaseDate(movie, tv)` — признак сериала передаёт вызывающий: поиск KP и ряды «Сейчас смотрят»
  — `movie.type === 'tv'`, как сейчас, `trailers` — `title.method === 'tv'`.

У KP-карточек `title` и `type` есть, их поведение не меняется.

### 3. Имя capability не меняется

Issue предлагал сделать `kp-card-trailers` спекой трейлеров любой карточки. Переименование
capability — перенос каталога спеки и ссылок на неё в доках без изменения поведения. Требование
«Трейлеры карточки TMDB» добавляется в ту же спеку, её Purpose дополняется карточками `tmdb`/`cub`
(Purpose дельтой не переносится); переименование — отдельным change, если понадобится.

### 4. Тесты

Двойники `tmdb.full`/`cub.full` в `load()` отвечают существующими опциями `movie`, `videos`,
`reactions`; помощник теста открывает ими карточку. Открытие KP-карточки в `load()` не меняется,
прежние тесты идут как есть. Опция `drop` принимает путь любой глубины (`Api.sources.cub.full`).
Живая проверка: общий помощник «первым — ролик сервиса» в `tests/live/kp-trailers/lib.js` для
шагов «Зверь» и нового «Чёрный лотос» (`tv/84553`) в `kp-trailers.sh`.

### 5. Сезон из ответа источника не берётся

`tmdb.full` сериала уже получил сведения о сериале, и `last_episode_to_air` можно было бы читать из
`result.movie`. Это второй путь рядом с `lastSeason` ради одного запроса, кэшированного на день;
`lastSeason` остаётся единственным.

## Risks / Trade-offs

- [Движок перестанет звать `full` источника при открытии карточки] → трейлеры пропадут молча, как
  у KP-карточки при том же изменении движка (обёртка `KP.full` устроена так же). Ловит человек: у
  карточки нет русского трейлера; диагноз — `bash tests/live/kp-trailers.sh`. Метка в результате,
  проверяемая в `onFull`, отклонена: связь результата `full` с событием `complite` на приставке не
  наблюдалась, а механизм был бы только для этого риска.
- [`full` источника позовут не для открытия карточки] → лишние `tv/<id>` и запрос к сервису. В
  наблюдении 6 на возврате и на Главной вызовов нет.
- [Сервис даёт ролик с низкой уверенностью] (`confidence 0.3` у «Чёрного лотоса») → тот же риск,
  что у KP-карточек; вне этого change.

## Migration Plan

`/simplify` до живой проверки, чтобы она шла один раз по итоговому коду. Снапшот пина по
`docs/snapshots-convention.md`, пин `kp-reactions-fix.js` на sha ветки, `bash
tests/live/kp-trailers.sh` (KP-карточки и «Чёрный лотос»), затем `screencap` карточки. `KP.full` и
ряды «Сейчас смотрят» change не трогает, `now-watching.sh` не нужен. После мержа — пин на sha
`main`. Откат: пин из снапшота, в репозитории — revert PR.
