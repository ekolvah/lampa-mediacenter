## 0. Delivery start

- [x] 0.1 `agent-process start_change trailer-card-type --planner Claude --implementer Claude`
  (tracking issue 102), дальше работа в `.claude/worktrees/trailer-card-type`.

## 1. RED

- [x] 1.1 `tests/test_trailer_service.py`: `FakeProfile.series`; параметризация вместо копий:
  `test_season_passed_to_finder` → `test_param_passed_to_finder` (`season=2`, `series=1` → `True`,
  `series=0` → `False`, без `series` → `None`), `test_library_adapter_passes_season` →
  `test_library_adapter_passes_params` (`season`, `series`), `test_bad_season_400` →
  `test_bad_int_param_400` (`(name, value)`: прежние значения `season` плюс `series` = `2`, `true`);
  `test_cache_key_includes_season` → `test_cache_key_includes_params` (`season=2` после запроса без
  сезона, `series=1` после `series=0`); новый `test_rejected_profile_400` — `LibraryFinder` с классом профиля, бросающим `ValueError`:
  400, поиска нет (решение 4).
- [x] 1.2 `tests/js/kp-reactions-fix.test.js`: построитель URL сервиса рядом с `q()` вместо пяти
  ручных URL (`SERVICE_URL`, `LOTUS_URL`, `NEAR_URL`, `GENT_URL`, строка 624) с `&series=` последним;
  проверки `endsWith('&season=2')` (строки 538, 718) — на `&season=2&series=1`; новый `service asked
  with card type` (сериал «Огонь» → `series=1`, фильм → `series=0`).
- [x] 1.3 `agent-process check_red tests/test_trailer_service.py tests/test_plugin_js.py::test_plugin_js`,
  коммит RED.

## 2. Сервис

- [x] 2.1 `TrailerQuery.series`, `maximum` у `_int_param` (решение 3), `ValueError` конструктора
  профиля → `BadRequest` в `LibraryFinder` и 400 в `do_GET` (решение 4), `series=` в `FilmProfile`,
  `series` в логе 502 (решение 5). Проверка: `python -m pytest tests/test_trailer_service.py`
  зелёный. Коммит.

## 3. Плагин и живая проверка

- [x] 3.1 `ruTrailer` добавляет `&series=` последним (решение 2). Проверка:
  `node --test tests/js/kp-reactions-fix.test.js` зелёный.
- [x] 3.2 `askService` в `tests/live/kp-trailers/lib.js` шлёт `series` так же (решение 6). Коммит.

## 4. Доки

- [x] 4.1 `docs/jacred-on-ugoos.md`: `series` в примере запроса, 400 на неверный тип и на
  `season` с `series=0`, тип в ключе кэша; строка `kp-reactions-fix.js` в
  `docs/lampa-config-review.md` и шапка `ruTrailer`: в запросе тип карточки. Проверка:
  `python scripts/ci_check.py --only links`. Коммит.

## 5. Verify

- [x] 5.1 `/simplify`, коммит его правок.
- [x] 5.2 Выкатка и живая проверка по design.md, Migration Plan 1–4 (сначала уточнить у
  пользователя ADB и IP).
- [x] 5.3 `openspec validate --strict --all`.
- [x] 5.4 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.
- [x] 5.5 Перезапуск Lampa (`am force-stop` + запуск), `screencap` карточки «Огонь» (KP 8941010)
  с трейлером сериала первым.

## 6. Deliver

- [x] 6.1 `agent-process archive_change trailer-card-type`, `gh pr create --title "fix:
  trailer-card-type" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| trailer-search-service | Ответ читает страница Lampa | `tests/test_trailer_service.py::test_cors_any_origin` |
| trailer-search-service | Ролик найден | `tests/test_trailer_service.py::test_found_returns_pick`, `::test_library_adapter_maps_pick` |
| trailer-search-service | Ролик не найден | `tests/test_trailer_service.py::test_no_match_returns_null` |
| trailer-search-service | Нет названия | `tests/test_trailer_service.py::test_bad_request_400` |
| trailer-search-service | Трейлер сезона найден | `tests/test_trailer_service.py::test_param_passed_to_finder`, `::test_library_adapter_passes_params` |
| trailer-search-service | Трейлера сезона нет | `tests/test_trailer_service.py::test_library_adapter_season_fallback_null` |
| trailer-search-service | Неверный сезон | `tests/test_trailer_service.py::test_bad_int_param_400` |
| trailer-search-service | Тип карточки | `tests/test_trailer_service.py::test_param_passed_to_finder`, `::test_library_adapter_passes_params` |
| trailer-search-service | Неверный тип | `tests/test_trailer_service.py::test_bad_int_param_400`, `::test_rejected_profile_400` |
| trailer-search-service | Повторный запрос | `tests/test_trailer_service.py::test_cache_hit_skips_search` |
| trailer-search-service | Кэш истёк | `tests/test_trailer_service.py::test_cache_expires_after_24h` |
| trailer-search-service | Повтор после ошибки | `tests/test_trailer_service.py::test_error_not_cached` |
| trailer-search-service | Другой сезон | `tests/test_trailer_service.py::test_cache_key_includes_params` |
| trailer-search-service | Другой тип | `tests/test_trailer_service.py::test_cache_key_includes_params` |
| kp-card-trailers | В TMDB есть русское видео | `ru video in TMDB: no service request` |
| kp-card-trailers | Русский трейлер найден на YouTube | `en-only videos: service video first` |
| kp-card-trailers | Видео TMDB пустые, трейлер найден | `empty or missing videos: service video only` |
| kp-card-trailers | Сервис ролик не дал | `service null, error or timeout: TMDB videos, warning` |
| kp-card-trailers | Русский трейлер с пульта | `tests/live/kp-trailers.sh` |
| kp-card-trailers | Тип карточки в запросе | `service asked with card type` |
