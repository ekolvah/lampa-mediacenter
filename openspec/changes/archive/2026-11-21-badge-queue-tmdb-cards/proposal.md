## Why

Tracking issue #83. На Главной KP `plugins/torrent-quality-badge.js` перестаёт проверять карточки в начале
сессии, и карточки без подходящих раздач остаются видимыми. Пример: «Скрудж» (2026) в «Сейчас смотрят
фильмы» при фильтре `quality: ["4k","1080p"]`, `lang: ["Русский"]`.

**Воспроизведение** (приставка, 2026-11-21, `tools/cdp.py`):
- в `torrent_filter_badge_cache` 14 свежих вердиктов, все в одну секунду, дальше ни одного. У «Скруджа»
  вердикт `miss: true` 893-минутной давности (TTL 6 ч истёк), и новой проверки не было;
- прямой `Lampa.Parser.get` для «Скруджа» отвечает за 35 мс, 4 раздачи TS/TSRip — парсер исправен;
- в рядах «Рекомендуем посмотреть фильмы/сериалы» у 14 из 14 видимых карточек `source: tmdb`, есть
  `genre_ids`, нет `genres` (у «Мэнди» ключи `adult,backdrop_path,genre_ids,id,title,…`). В
  `recomends_list` 119 записей, `genres` нет ни у одной. В KP-рядах `genres` есть у всех карточек;
- `Lampa.Parser.get({…, movie: <карточка «Мэнди»>})` синхронно бросает
  `TypeError: Cannot read property 'map' of undefined`.

**Корневая причина.** `jackett()` в `app.min.js?v=1994719` начинается с
`var genres = params.movie.genres.map(function (a) { return a.name; });` при `!params.from_search`.
`pump()` плагина делает `active++` и вызывает `Lampa.Parser.get` без защиты. Исключение обходит оба
колбэка, `finishTask` не вызывается, слот не освобождается, `inFlight[key]` остаётся. После двух таких
карточек `MAX_CONCURRENT = 2` занят навсегда, и до конца сессии ничего не проверяется. Об этом не пишется
ни ошибки, ни метки (§III, §IV).

Дефект касается любой карточки из списков TMDB, где бы плагин её ни проверял: Главная и сетки
источника TMDB, экран «Ещё» рекомендаций. Увидели его на Главной KP, куда TMDB-карточки попали с #82
(`kp-main-recommendations`, 2026-11-20). До него там были только KP-карточки, а у них `genres` есть.

## What Changes

- Карточку без `genres` плагин передаёт парсеру копией с `genres`, собранными из `genre_ids`. Такая
  карточка получает вердикт, как любая другая.
- Синхронное исключение из `Lampa.Parser.get` больше не останавливает очередь. Проверка завершается как
  неудавшаяся (карточка видима, как при ошибке парсера), в консоль пишется `console.error` с названием
  карточки и причиной.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `card-torrent-filter`: добавлено требование «Проверка не встаёт» — карточка без `genres` проверяется,
  сбой запуска проверки одной карточки виден и не мешает проверке остальных.

## Impact

- Изменены:
  - `plugins/torrent-quality-badge.js`: `pump()` (защита вызова), подготовка карточки для парсера;
  - `tests/js/torrent-quality-badge.test.js`: тесты очереди с двойником `Lampa.Parser`;
  - `tests/live/hide-cards.sh`: шаги проверки очереди до и после рестарта Lampa.
- Добавлены:
  - `tests/live/hide-cards/queue-cold.js`, `tests/live/hide-cards/queue-drains.js`: живая проверка;
  - `openspec/changes/badge-queue-tmdb-cards/`.
- На приставке пин `torrent-quality-badge.js` переводится на новый sha (design.md, Migration Plan).
