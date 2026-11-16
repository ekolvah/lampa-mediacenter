## 0. Delivery start

- [x] 0.1 `agent-process start_change trailers-external-player --planner Claude --implementer Claude`
  (tracking issue 65); войти в `.claude/worktrees/trailers-external-player` через `EnterWorktree`.

## 1. RED

- [x] 1.1 no RED: меняются только живой тест и док. Поведение продукта не меняется, pytest-теста нет.
  Как воспроизвести — proposal.md, Why: при `youtube` открывается SmartTube, а текущий `playing.js`
  ждёт мост.

## 2. Живая проверка

- [x] 2.1 Новый `tests/live/kp-trailers/preflight.js` по design.md, решение 2. В `kp-trailers.sh`
  его `step` идёт после `restart_lampa`.
- [x] 2.2 `tests/live/kp-trailers/playing.js` по решению 2: прочитать id, обнулить, проверить его;
  `Live.check`.
- [x] 2.3 `tests/live/kp-trailers.sh`: `trailer_plays` по решению 2, один вызов `adb_sh`.
  Используется в проходе кнопкой и в `play_first_trailer`. Удалить `trailer-focus.js` и параметр
  `play_first_trailer`. В `open-card-no-imdb.js` поправить комментарий, который ссылается на
  `trailer-focus.js`. В шапке требование «YouTube + SmartTube».
  Проверка: `bash tests/live/kp-trailers.sh` → `OK`, затем `restart_lampa` и screencap (CLAUDE.md).
  Коммит группы.

## 3. Доки (отдельный коммит)

- [x] 3.1 `docs/lampa-config-review.md`, «Текущее состояние»: абзац «Плеер для трейлеров».
  Проверка: `python scripts/ci_check.py --only links`.

## 4. Verify

- [x] 4.1 `/simplify`, коммит правок.
- [ ] 4.2 `openspec validate --strict --all`.
- [ ] 4.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 5. Deliver

- [ ] 5.1 `agent-process archive_change trailers-external-player`, затем
  `gh pr create --title "test: trailers-external-player" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой.
- [ ] 5.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`. Не больше трёх
  раундов правок по ревью.
- [ ] 5.3 После мержа закрыть #61 и #62 с комментариями (proposal.md, What Changes).

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| — | — | n/a: `skip_specs`, дельт нет. Ниже действующие сценарии, которые затрагивает правка теста |
| `kp-card-trailers` | Запуск трейлера пультом | `tests/live/kp-trailers.sh`, «1+1»: `trailer_plays`, `playing` |
| `kp-card-trailers` | Русский трейлер с пульта | `tests/live/kp-trailers.sh`, «Зверь» списком: `trailer_plays`, `playing` (id = `__kpRuTrailer.key`). Доказано до отданного id (design.md, решение 2) |
| `kp-card-trailers` | Трейлер одним нажатием с пульта | `tests/live/kp-trailers.sh`, «Зверь» кнопкой: `button-focus`, `trailer_plays`, `playing`. Доказано до отданного id (design.md, решение 2) |
