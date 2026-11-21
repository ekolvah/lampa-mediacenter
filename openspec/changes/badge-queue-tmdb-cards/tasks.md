## 0. Delivery start

- [x] 0.1 Run `agent-process start_change badge-queue-tmdb-cards --planner Claude --implementer Claude` (tracking issue 83); verify it prints the worktree path, then `EnterWorktree` there

## 1. RED

- [x] 1.1 Add to `tests/js/torrent-quality-badge.test.js` the two tests named in the map below. Drive cards through the existing `attached(fullGrid())` path; extend the `lampa()` double with a cold verdict cache (a plain object instead of the always-hit `Proxy`) and a `Parser.get` double that, like the engine's `jackett()`, calls `movie.genres.map(...)` synchronously, records the `movie` it got, and then calls `oncomplete` with configured results, throws for configured cards, or calls `oncomplete` and then throws. The throw test asserts the thrown message is among the `console.error` arguments; its `oncomplete`-then-throw case asserts a third card still waits while two are in flight
- [x] 1.2 Run `agent-process check_red tests/test_plugin_js.py::test_plugin_js`; verify both new tests fail on the thrown `TypeError` / stalled queue, not on the doubles; commit RED with the ticks

## 2. Plugin

- [ ] 2.1 Design 1 and 2 in `pump()`, including the per-task finish-once guard; verify `python -m pytest tests/test_plugin_js.py` green (both new tests, the card's own `data` has no `genres`) and `node --check plugins/torrent-quality-badge.js`; commit

## 3. Live check

- [ ] 3.1 Design 3: add `tests/live/hide-cards/queue-cold.js` and `tests/live/hide-cards/queue-drains.js`, run `queue-cold`, `rebuild-main`, then `queue-drains` (15 s per call, up to four calls) right after `restart_lampa` in `tests/live/hide-cards.sh` (not in the `grid` branch); verify `bash -n tests/live/hide-cards.sh`; commit
- [ ] 3.2 Device run: push the branch; snapshot per `docs/snapshots-convention.md`; switch the `torrent-quality-badge.js` URL to `@<branch head sha>` via `cdp.py`; force-stop and restart Lampa; run `bash tests/live/hide-cards.sh`, verify exit 0 and that «Скрудж» (or another card with cached `miss: true`) is absent from «Сейчас смотрят фильмы»; switch the URL back to the sha from the snapshot, force-stop, restart and check by `screencap` that Главная renders (CLAUDE.md, после живого тестирования)

## 4. Verify

- [ ] 4.1 Run `/simplify` and commit its edits; if they touch the plugin, repeat the device run of 3.2
- [ ] 4.2 Run `openspec validate --strict --all`
- [ ] 4.3 Run `pre-commit run --hook-stage manual --all-files`

## 5. Deliver

- [ ] 5.1 `agent-process archive_change badge-queue-tmdb-cards`, then `gh pr create --title "fix: badge-queue-tmdb-cards" --body-file <report>`, `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`
- [ ] 5.2 After the person merges: the device run of 3.2 on the merge commit's sha, keeping it pinned (design Migration Plan)

## Scenario → test map

| Scenario | Test |
|---|---|
| Проверка не встаёт / Карточка TMDB без жанров | `tests/js/torrent-quality-badge.test.js`: `tmdb card without genres is checked` |
| Проверка не встаёт / Проверка карточки не началась | `tests/js/torrent-quality-badge.test.js`: `parser throws keep cards and do not stall queue` |
| Проверка не встаёт / Очередь на приставке | `tests/live/hide-cards.sh`, шаги `queue-cold`, `rebuild-main`, `queue-drains` |
