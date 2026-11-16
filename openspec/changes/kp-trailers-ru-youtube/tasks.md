## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-trailers-ru-youtube --planner Claude --implementer Claude`
  (tracking issue 48); войти в `.claude/worktrees/kp-trailers-ru-youtube` через `EnterWorktree`.
- [x] 0.2 Зонд на приставке до кода (design.md, решения 7, 8, «Risks»). `adb root`, затем
  `adb shell id` → `uid=0` (команды на приставке — через `adb shell`, не `su -c`). Снапшот по `docs/snapshots-convention.md`:
  `/system/su.d/99jacred`, `/data/debian/root/jacred-start.sh`, список пакетов chroot. В chroot:
  `python3 --version` (ожидается 3.13, библиотеке нужен ≥3.12), `command -v start-stop-daemon`, `apt install python3
  python3-venv`, venv `/opt/trailer-search/venv`, `pip install -r trailer-search.requirements.txt`
  (файл из задачи 2.4 собрать здесь же), затем по три раза `time` вызова `find_trailer` для «Зверь»
  и «Лес». Записать время в план. Если медиана дольше 10 с или чего-то из перечисленного нет — стоп,
  вернуться к дизайну с пользователем.
  **Результат 2026-11-16:** `uid=0`, Python 3.13.5, `/usr/sbin/start-stop-daemon` есть. Поставлен ещё
  `git` (pip нужен для `git+https`). `find_trailer` с `deadline_s=8`: «Зверь» 2,15/2,03/2,02 с
  (медиана 2,03, `J2VS_OlUJtA`), «Лес» 1,50/1,57/1,35 с (медиана 1,50). В chroot протекает
  андроидный `TMPDIR=/data/local/tmp`, которого там нет (на нём упал postinst `ca-certificates`), —
  `start.d/*.sh` задают `TMPDIR=/tmp`.

## 1. RED

- [x] 1.1 `tests/test_trailer_service.py`: тесты из карты ниже. Сервер на эфемерном порту, двойник
  `TrailerFinder`, подставные часы (design.md, решение 3).
- [x] 1.2 `tests/js/kp-reactions-fix.test.js`: тесты из карты ниже. Двойник `Lampa.Reguest` отвечает
  роликом, `null`, ошибкой или таймаутом.
- [x] 1.3 `tests/test_chroot_start.py`: тесты из карты ниже, настоящий `start-stop-daemon` с `sleep` и
  `sh -c 'exit 1'` во временном каталоге; без `start-stop-daemon` — `pytest.skip` с причиной, а при заданной `CI` — падение с причиной
  (design.md, решение 8).
- [x] 1.4 `agent-process check_red tests/test_trailer_service.py tests/test_chroot_start.py tests/test_plugin_js.py::test_plugin_js`,
  коммит RED.

## 2. Сервис и запуск

- [x] 2.1 `tools/trailer_service.py`: свои типы и `TrailerFinder` Protocol, 400 на неверный запрос,
  200 с роликом или `null`, `SearchFailed` → 502 + ERROR (решения 3, 5). Проверка:
  `python -m pytest tests/test_trailer_service.py`.
- [x] 2.2 Кэш 24 ч без ошибок (решение 4). Проверка: тесты `test_cache_*`, `test_error_not_cached`.
- [x] 2.3 `library_finder` и `main()`: `127.0.0.1:9118`, импорт библиотеки внутри `main()`,
  `find_trailer` + `YtDlpRetriever(socket_timeout=4, deadline_s=8)`, `time.monotonic`, лог в stderr (решения 2, 3).
  Проверка: `test_main_binds_loopback`, `test_library_adapter_*`.
- [x] 2.4 `tools/trailer-search.requirements.txt` и хук `pip-audit` на него (решение 9). Проверка:
  `pre-commit run --hook-stage manual --all-files`. Если хук клонирует и собирает git-зависимость
  дольше минуты — сказать пользователю до коммита.
- [x] 2.5 `tools/chroot-start.sh` на `start-stop-daemon` (решение 8). Проверка:
  `python -m pytest tests/test_chroot_start.py` (на CI; локально без `start-stop-daemon` — skip).
- [x] 2.6 `tools/start.d/{jacred,trailer-search}.sh`, `tools/chroot-boot.sh`; удалить
  `tools/jacred-start.sh`, `tools/jacred-boot.sh` (решение 8). Проверка: `bash -n` на всех; живая —
  задача 4.2. Коммит группы.

## 3. Плагин

- [x] 3.1 `plugins/kp-reactions-fix.js`: условие «нет видео на `ru`», запрос к сервису с таймаутом
  10 с, ролик первым в `videos.results`, предупреждения (решения 6, 7). Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`. Коммит группы.

## 4. Приставка

- [x] 4.1 Разложить `trailer_service.py` в chroot (venv готов в задаче 0.2), снапшот по
  `docs/snapshots-convention.md` перед правкой.
- [x] 4.2 Переход на общий запуск (решение 8): разложить `chroot-start.sh` и `start.d/`, `pkill JacRed`,
  запустить оба `start.d/*.sh`; `99jacred` → `99chroot`. Проверка: поиск торрентов в Lampa работает;
  на приставке `curl 'http://127.0.0.1:9118/trailer?title=Зверь&original_title=The%20Beast&year=2026'`
  → 200 с `video_id`; повторный запуск → `already running`, код 0. Затем перезагрузка (пользователь
  разрешил без отдельного вопроса, 2026-11-07): тот же `curl` → 200, в `/data/local/tmp/chroot-boot.log` `rc=0` для обоих, поиск
  торрентов работает.
- [x] 4.3 Плагин на приставку (тот же путь, что для `kp-card-trailers`). Замерить время открытия
  карточки «Зверь» на промахе кэша (решение 7) и записать в `docs/jacred-on-ugoos.md`. Больше 10 с —
  стоп, вернуться к дизайну.

## 5. Живая проверка

- [x] 5.1 `tests/live/kp-trailers/open-card-no-imdb.js`: дописать проверку, что первым в
  `videos.results` стоит ролик с `iso_639_1` `ru`, и его `key` равен `video_id` из ответа сервиса
  (запрос к `127.0.0.1:9118` из того же шага); его `name` сохранить в `window` для шага 5.2.
- [x] 5.2 Новый шаг `tests/live/kp-trailers/trailer-focus.js`: в открытом списке «Трейлеры» под
  фокусом пункт с этим `name` — то есть с пульта играет ролик сервиса, а не любой (`playing.js`
  проверяет только, что что-то играет).
- [x] 5.3 `tests/live/kp-trailers.sh`: шаги пульта (`ui.py` → `menu-focus` → `trailer-focus` →
  `playing`) — в функцию, вызвать и для «Зверя». Проверка: `bash tests/live/kp-trailers.sh` → `OK`,
  затем рестарт процесса Lampa и `screencap` (CLAUDE.md, «Быстрый старт»). Коммит группы.

## 6. Доки (отдельный коммит)

- [x] 6.1 `docs/jacred-on-ugoos.md`, `tools/README.md`, `CLAUDE.md`, `docs/lampa-config-review.md` —
  по списку в proposal.md, Impact. Старое описание `jacred-start.sh`/`jacred-boot.sh`/`99jacred` удалить,
  а не дописать рядом. Проверка: `python scripts/ci_check.py --only links`.

## 7. Verify

- [ ] 7.1 `/simplify`, коммит правок.
- [ ] 7.2 `openspec validate --strict --all`.
- [ ] 7.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 8. Deliver

- [ ] 8.1 `agent-process archive_change kp-trailers-ru-youtube`, затем
  `gh pr create --title "feat: kp-trailers-ru-youtube" --body-file <отчёт>`. Отчёт ссылается на #48
  простой ссылкой.
- [ ] 8.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| kp-card-trailers | Видео не пришли | `tests/js/kp-reactions-fix.test.js` «empty videos, service gave nothing: no trailers, warning» |
| kp-card-trailers | В TMDB есть русское видео | `tests/js/kp-reactions-fix.test.js` «ru video in TMDB: no service request» |
| kp-card-trailers | Русский трейлер найден на YouTube | `tests/js/kp-reactions-fix.test.js` «en-only videos: service video first» |
| kp-card-trailers | Видео TMDB пустые, трейлер найден | `tests/js/kp-reactions-fix.test.js` «empty videos: service video only» |
| kp-card-trailers | Сервис ролик не дал | `tests/js/kp-reactions-fix.test.js` «service null, error or timeout: TMDB videos, warning» (по случаю на каждый исход) |
| kp-card-trailers | Русский трейлер с пульта | `tests/live/kp-trailers.sh`, шаги `open-card-no-imdb`, `trailer-focus` и `playing` для «Зверя» |
| trailer-search-service | Ролик найден | `tests/test_trailer_service.py::test_found_returns_pick`, `tests/test_trailer_service.py::test_library_adapter_maps_pick` |
| trailer-search-service | Ответ читает страница Lampa | `tests/test_trailer_service.py::test_cors_any_origin` |
| trailer-search-service | Ролик не найден | `tests/test_trailer_service.py::test_no_match_returns_null` |
| trailer-search-service | Нет названия | `tests/test_trailer_service.py::test_bad_request_400` |
| trailer-search-service | YouTube отказал | `tests/test_trailer_service.py::test_retrieval_error_502_logged`, `tests/test_trailer_service.py::test_library_adapter_maps_error` |
| trailer-search-service | Повторный запрос | `tests/test_trailer_service.py::test_cache_hit_skips_search` |
| trailer-search-service | Кэш истёк | `tests/test_trailer_service.py::test_cache_expires_after_24h` |
| trailer-search-service | Повтор после ошибки | `tests/test_trailer_service.py::test_error_not_cached` |
| trailer-search-service | После перезагрузки | n/a: перезагрузка приставки, задача 4.2 (`curl` и `rc=0` в `chroot-boot.log`); сбой старта — `tests/test_chroot_start.py::test_failed_start_tails_log` |
| trailer-search-service | Повторный запуск | `tests/test_chroot_start.py::test_already_running`, `tests/test_chroot_start.py::test_stale_pidfile_starts` |
