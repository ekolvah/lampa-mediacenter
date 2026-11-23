# tmdb-access Specification

## Purpose
Lampa на приставке ходит в TMDB напрямую, а не через TMDB-прокси Lampac, который вырезает часть тайтлов, поэтому тайтл, который есть в TMDB, находится и в Lampa.

## Requirements

### Requirement: TMDB без чужой фильтрации
Lampa на приставке SHALL NOT запрашивать TMDB и его картинки через TMDB-прокси Lampac
(`beta.l-vid.online`). Тайтл, который есть в TMDB, MUST находиться через Lampa тем же запросом.

#### Scenario: Тайтл, скрытый прокси Lampac, находится
- **WHEN** на приставке через `Lampa.Api.sources.tmdb.get` запрошен `find/tt33071426?external_source=imdb_id`
- **THEN** в `movie_results` есть фильм с id `1325734`

#### Scenario: Адреса TMDB не ведут на прокси Lampac
- **WHEN** на приставке после перезапуска Lampa построены `Lampa.TMDB.api('find/tt33071426')` и `Lampa.TMDB.image('t/p/w200/x.jpg')`
- **THEN** ни один адрес не ведёт на `beta.l-vid.online`

### Requirement: Без DMCA-блокировки клиента
Lampa на приставке SHALL NOT применять клиентский DMCA-список CUB (`tmdb.<cub_domain>/blocked`):
тайтл TMDB MUST открываться карточкой источника `tmdb` и MUST оставаться в выдаче поиска,
даже если он есть в этом списке. Список ядра `window.lampa_settings.dcma` MUST читаться как
`false`, как бы ядро его ни записывало, до старта плагина или после. Если отключить список не
удалось, Lampa MUST показать уведомление и записать `console.error` с причиной.

#### Scenario: Тайтл из DMCA-списка открывается карточкой tmdb
- **WHEN** на приставке после перезапуска Lampa через `Lampa.Api.sources.tmdb.full` запрошен `{method: 'tv', id: 234763}`
- **THEN** вызов приносит карточку «Слово пацана. Кровь на асфальте», а не ошибку

#### Scenario: Тайтл из DMCA-списка остаётся в выдаче поиска
- **WHEN** на приставке в поиске Lampa набрано «Слово пацана»
- **THEN** в выдаче есть «Слово пацана. Кровь на асфальте»

#### Scenario: Список, записанный ядром после старта плагина, не действует
- **WHEN** после старта плагина ядро записывает в `lampa_settings.dcma` список с `{id: 234763, cat: 'tv'}`
- **THEN** `lampa_settings.dcma` читается как `false`

#### Scenario: Список, записанный до старта плагина, не действует
- **WHEN** плагин стартует, когда в `lampa_settings.dcma` уже лежит список с `{id: 234763, cat: 'tv'}`
- **THEN** `lampa_settings.dcma` читается как `false`

#### Scenario: Список не отключён — это видно
- **WHEN** плагин стартует, а свойство `dcma` объекта `lampa_settings` переопределить нельзя или самого `lampa_settings` нет
- **THEN** показывается `Lampa.Noty` и пишется `console.error` с причиной, а остальной плагин запускается как обычно
