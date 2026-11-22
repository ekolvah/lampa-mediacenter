## Why

Сервис трейлеров не сообщает библиотеке `trailer-search`, фильм в карточке или сериал, и библиотека
отдаёт трейлер одноимённого тайтла другого типа (issue #102).

**Воспроизведение** (ответ сервиса на приставке 2026-11-22, запрос тот же, что шлёт плагин,
ekolvah/trailer-search#16): «Огонь», сериал 2025 (KP 8941010),
`GET /trailer?title=Огонь&original_title=Огонь&year=2025` →
`{"video_id": "CAVdJB1qj9E", "title": "Огонь - Финальный трейлер", "confidence": 0.9, "reason": "ru language"}` —
финальный трейлер фильма 2020 года.

**Причина**: плагин знает тип (`plugins/kp-reactions-fix.js:265`,
`var tv = title ? title.method === 'tv' : movie.type === 'tv';`), но `ruTrailer` в URL его не
кладёт, а `tools/trailer_service.py` строит `FilmProfile(title, original_title, year, season=…)`
без `series`. В `trailer-search` v0.3.0 (пин уже поднят, #103) у `FilmProfile` есть
`series: bool | None`; без него тип неизвестен и отбор по типу выключен.

## What Changes

- Плагин передаёт в `GET /trailer` тип карточки: `series=1` для сериала, `series=0` для фильма.
- Сервис разбирает `series` (`0`/`1`, без параметра — тип неизвестен) и передаёт его в
  `FilmProfile`; на другое значение и на профиль, который библиотека отвергает (`season` с
  `series=0`), отвечает 400. Тип входит в ключ кэша.
- Живая проверка шлёт сервису тот же запрос, что плагин.

## Capabilities

### New Capabilities

### Modified Capabilities
- `trailer-search-service`: параметр `series` в «Поиск трейлера по названию», тип в ключе кэша и сценарий «Другой тип».
- `kp-card-trailers`: «Русский трейлер с YouTube» — в запросе к сервису есть тип карточки.

## Impact

Изменяются:
- `tools/trailer_service.py` — `TrailerQuery.series`, `maximum` у `_int_param`, `ValueError`
  профиля → 400, тип в логе ошибки.
- `tests/test_trailer_service.py` — параметризация тестов сезона типом, `FakeProfile.series`.
- `plugins/kp-reactions-fix.js` — `ruTrailer` добавляет `&series=`.
- `tests/js/kp-reactions-fix.test.js` — построитель URL сервиса, тест типа.
- `tests/live/kp-trailers/lib.js` — `askService` шлёт `series`.

Доки (отдельным коммитом): `docs/jacred-on-ugoos.md`, `docs/lampa-config-review.md`.

Добавляемых и удаляемых файлов нет. Зависимостей нет: пин `trailer-search` v0.3.0 уже в
`tools/trailer-search.requirements.txt`. На приставке: `trailer_service.py` в
`/data/debian/opt/trailer-search/` с перезапуском сервиса и пин плагина на новый sha.
