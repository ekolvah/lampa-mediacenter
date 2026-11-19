# tmdb-access Specification

## Purpose
TBD - created by archiving change disable-lampac-tmdb-proxy. Update Purpose after archive.

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
