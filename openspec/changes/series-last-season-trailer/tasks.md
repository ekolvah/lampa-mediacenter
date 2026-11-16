## 0. Delivery start

- [x] 0.1 `agent-process start_change series-last-season-trailer --planner Claude --implementer Claude`
  (tracking issue 64); войти в `.claude/worktrees/series-last-season-trailer` через `EnterWorktree`.

## 1. RED

- [x] 1.1 `tests/test_trailer_service.py`: тесты `trailer-search-service` из карты ниже, которых ещё нет; в
  `reason` фейковой библиотеки — точный текст v0.2.0 `…; season 2 fallback` (design.md, решение 5).
- [x] 1.2 `tests/js/kp-reactions-fix.test.js`: двойник `tmdb.get` отвечает на `tv/<id>` (по умолчанию
  один вышедший сезон, чтобы прежние тесты сериалов не менялись), двойник `tmdb.videos` — на
  `tv/<id>/season`; тесты `kp-card-trailers` из карты ниже, которых ещё нет; «ru video in TMDB: no
  service request» дополняется сериалом с одним сезоном.
  Двойник `Lampa.Storage.field('tmdb_lang')` = `ru`. В тестах «last season 2: service asked with season
  despite ru video, its video first» и «service gave nothing: newest TMDB season trailer first, warning»
  проверяются оба ключа сортировки движка у вставленного ролика: `iso_639_1` = `tmdb_lang` и
  `published_at` строго позже всех прочих. В одной фикстуре есть видео TMDB новее даты сезона N, чтобы
  первым ролик ставил именно сдвиг даты (design.md, решение 4).
- [x] 1.3 `agent-process check_red tests/test_plugin_js.py::test_plugin_js
  tests/test_trailer_service.py::test_season_passed_to_finder tests/test_trailer_service.py::test_bad_season_400
  tests/test_trailer_service.py::test_cache_key_includes_season
  tests/test_trailer_service.py::test_library_adapter_passes_season
  tests/test_trailer_service.py::test_library_adapter_season_fallback_null`, коммит RED.

## 2. Сервис

- [x] 2.1 Общий разбор целого параметра для `year` и `season` (≥ 1, иначе `BadRequest`),
  `TrailerQuery.season`, `season` в `FilmProfile` у `LibraryFinder`, ролик другого сезона →
  `video_id: null` с тем же `reason` (design.md, решение 5). Проверка:
  `python -m pytest tests/test_trailer_service.py`.
- [x] 2.2 Пин `tools/trailer-search.requirements.txt`: `v0.1.0` → `v0.2.0`. Проверка:
  `pip-audit` из `pre-commit run --hook-stage manual --all-files`. Рядом с пином — комментарий: после
  поднятия пина обязателен `bash tests/live/kp-trailers.sh` (design.md, Risks).
- [x] 2.3 Issue в `ekolvah/trailer-search`: структурный признак замены сезона в `TrailerPick` вместо
  суффикса `reason`. Ссылка на него — в design.md, Risks, и в комментарии у проверки суффикса в
  `tools/trailer_service.py`. Проверка: `gh issue view <N> --repo ekolvah/trailer-search`. Коммит группы.

## 3. Плагин

Проверка каждой задачи — строки карты для её решения; в конце группы
`node --test tests/js/kp-reactions-fix.test.js` и коммит.

- [x] 3.1 `resolveTitle`: тип карточки при `movie_results` и `tv_results` (решение 1).
- [x] 3.2 `enrich`: `tmdb.get('tv/<id>')` параллельно с видео и реакциями (`pending` = 3), N и дата из
  `last_episode_to_air`, при ошибке — предупреждение с id и прежнее поведение (решение 2).
- [x] 3.3 Одна функция вставки ролика первым (`tmdb_lang`, дата строго позже самой новой в списке), ей пользуются и
  прежний путь фильма, и сериал; при N ≥ 2 сервис с `season=N` всегда (решения 3, 4).
- [x] 3.4 Без ролика сервиса — самый новый `Trailer` сезона N из `tmdb.videos({method: 'tv/<id>/season',
  id: N})`; иначе список как есть; оба случая с предупреждением; ответ не `{results: [...]}` — пустой
  список; ожидание ограничено `TRAILER_TIMEOUT_MS`, поздний колбэк игнорируется (решение 4).

## 4. Живая проверка

- [x] 4.1 `tests/live/kp-trailers/lib.js`: `kpFull(id)` и `askService(movie, season)` из
  `open-card-no-imdb.js`, тот переводится на них. Новый `open-card-season.js`: `kpFull('KP_1435343')` —
  `movie.type` = `tv`; `askService(movie, 2)`; первый ролик — ролик сервиса, а если сервис не дал —
  `Trailer` 2-го сезона из TMDB; название первого ролика говорит о 2-м сезоне
  (`/2\s*сезон|сезон\s*2|season\s*2/i`, иначе `Live.check` падает с названием); `openCard`, `window.__kpRuTrailer` = первый ролик. В `kp-trailers.sh`
  проход кнопкой «Зверя» (`DPAD_RIGHT`, `button-focus`, `DPAD_CENTER`, `playing`) выносится в
  `play_trailer_button <шаг открытия>`, затем `play_trailer_button open-card-season` для «Джентльменов».
- [ ] 4.2 Выкладка по design.md, Migration Plan, шаги 1–3. Проверка: `bash tests/live/kp-trailers.sh`
  → `OK: kp-trailers`. Коммит группы.

## 5. Доки (отдельный коммит)

- [ ] 5.1 `docs/jacred-on-ugoos.md`: параметр `season` и ответ `video_id: null` на замену другим сезоном в
  описании API сервиса; `docs/lampa-config-review.md`, строка `kp-reactions-fix`: тайтл по типу карточки
  и трейлер последнего сезона у сериалов. Проверка: `python scripts/ci_check.py --only links`.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change series-last-season-trailer`, затем
  `gh pr create --title "fix: series-last-season-trailer" --body-file <отчёт>`. Отчёт ссылается на #64
  простой ссылкой.
- [ ] 7.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.
- [ ] 7.3 После мержа — design.md, Migration Plan, шаг 4.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| trailer-search-service | Ответ читает страница Lampa | `tests/test_trailer_service.py::test_cors_any_origin` |
| trailer-search-service | Ролик найден | `tests/test_trailer_service.py::test_found_returns_pick` |
| trailer-search-service | Ролик не найден | `tests/test_trailer_service.py::test_no_match_returns_null` |
| trailer-search-service | Нет названия | `tests/test_trailer_service.py::test_bad_request_400` |
| trailer-search-service | Трейлер сезона найден | `tests/test_trailer_service.py::test_season_passed_to_finder`, `::test_library_adapter_passes_season` |
| trailer-search-service | Трейлера сезона нет | `tests/test_trailer_service.py::test_library_adapter_season_fallback_null` |
| trailer-search-service | Неверный сезон | `tests/test_trailer_service.py::test_bad_season_400` |
| trailer-search-service | Повторный запрос | `tests/test_trailer_service.py::test_cache_hit_skips_search` |
| trailer-search-service | Кэш истёк | `tests/test_trailer_service.py::test_cache_expires_after_24h` |
| trailer-search-service | Повтор после ошибки | `tests/test_trailer_service.py::test_error_not_cached` |
| trailer-search-service | Другой сезон | `tests/test_trailer_service.py::test_cache_key_includes_season` |
| kp-card-trailers | Трейлер найден | `tests/js/kp-reactions-fix.test.js` «videos and reactions added for found movie» |
| kp-card-trailers | Сериал | `tests/js/kp-reactions-fix.test.js` «tv match requests videos and reactions as tv» |
| kp-card-trailers | По imdb_id и фильм, и сериал | `tests/js/kp-reactions-fix.test.js` «find with movie and tv picks card type» |
| kp-card-trailers | Нет imdb_id | `tests/js/kp-reactions-fix.test.js` «no imdb_id searches by title and year» |
| kp-card-trailers | TMDB не нашёл тайтл | `tests/js/kp-reactions-fix.test.js` «empty find falls back to title search» |
| kp-card-trailers | В TMDB есть русское видео | `tests/js/kp-reactions-fix.test.js` «ru video in TMDB: no service request» (фильм и сериал с одним сезоном) |
| kp-card-trailers | Русский трейлер найден на YouTube | `tests/js/kp-reactions-fix.test.js` «en-only videos: service video first» |
| kp-card-trailers | Видео TMDB пустые, трейлер найден | `tests/js/kp-reactions-fix.test.js` «empty or missing videos: service video only» |
| kp-card-trailers | Сервис ролик не дал | `tests/js/kp-reactions-fix.test.js` «service null, error or timeout: TMDB videos, warning» |
| kp-card-trailers | Русский трейлер с пульта | `tests/live/kp-trailers.sh`, «Зверь» |
| kp-card-trailers | Русский трейлер последнего сезона | `tests/js/kp-reactions-fix.test.js` «last season 2: service asked with season despite ru video, its video first» |
| kp-card-trailers | Объявленный сезон не считается | `tests/js/kp-reactions-fix.test.js` «last season from last episode, not number of seasons» |
| kp-card-trailers | Трейлер сезона из TMDB | `tests/js/kp-reactions-fix.test.js` «service gave nothing: newest TMDB season trailer first, warning» |
| kp-card-trailers | Видео сезона нет | `tests/js/kp-reactions-fix.test.js` «no season trailer, error or timeout: TMDB videos, warning» |
| kp-card-trailers | Сведения о сериале не получены | `tests/js/kp-reactions-fix.test.js` «tv details error: film behaviour, warning with id» |
| kp-card-trailers | Трейлер последнего сезона с пульта | `tests/live/kp-trailers.sh`, «Джентльмены»: `open-card-season`, `button-focus`, `playing` |
