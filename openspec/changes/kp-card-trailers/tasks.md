## 0. Delivery start

- [x] 0.1 Run `agent-process start_change kp-card-trailers --planner Claude --implementer Claude` (tracking issue 43); verify it prints the worktree path, then `EnterWorktree` there

## 1. RED

- [ ] 1.1 Write `tests/js/kp-reactions-fix.test.js`: load `plugins/kp-reactions-fix.js` via `vm.runInNewContext` in a fresh context per test with in-memory doubles of `KP`, `tmdb`, `cub` (design 7); tests named in the map below, plus `missing tmdb.videos warns, reactions only`, `find requested with cache life` and `find error warns with imdb_id, card opens` (design 4, 6)
- [ ] 1.2 Run `agent-process check_red tests/test_plugin_js.py::test_plugin_js`; verify the failing tests and their assertions are exactly: `videos and reactions added for found movie` (`result.videos` undefined), `tv match requests videos and reactions as tv` (no `videos` call; reactions method `movie`), `empty videos warns with method and id` (no warning), `missing tmdb.videos warns, reactions only` (no warning), `find requested with cache life` (no cache argument), `find error warns with imdb_id, card opens` (no warning); and that `oncomplite called once`, `no imdb_id completes without tmdb calls`, `no find match completes without videos` pass (behaviour kept); commit RED with the ticks

## 2. Plugin

- [ ] 2.1 Pass a 7-day cache to the `find` call (design 4); derive `{method, id}` once from the `find` result and pass it to both `cub.reactionsGet` and `tmdb.videos`, run them in parallel, call `oncomplite` once when both answered (design 2, 3, 5); update the header comment (design 1)
- [ ] 2.2 Empty `videos.results` for a found title, or `tmdb.videos` not a function → `console.warn` with method and id; `find` error → `console.warn` with `imdb_id` (design 6)
- [ ] 2.3 Verify `python -m pytest tests/test_plugin_js.py` is green and `node --check plugins/kp-reactions-fix.js` passes; commit

## 3. Live check

- [ ] 3.1 Move `adb_sh`, `step`, `restart_lampa` to `tests/live/lib.sh` and `sleep`, `check` to `tests/live/lib.js` with a new `waitFor` (design 9); verify `bash -n` on both scripts and that `hide-cards.sh` still sources and runs its first step
- [ ] 3.2 Write `tests/live/kp-trailers.sh` and `tests/live/kp-trailers/*.js` with steps 1–3 of design 9, capturing the keys and the select controller name live via `ui.py --expect`
- [ ] 3.3 Push the branch; run step 1 of design Migration / Rollback; verify `bash tests/live/kp-trailers.sh` exits 0; one `screencap` while the trailer plays to confirm video on screen
- [ ] 3.4 Update the plugin row in `docs/lampa-config-review.md` (trailers, URL by sha); verify `python scripts/ci_check.py --only links`; commit

## 4. Verify

- [ ] 4.1 Run `/simplify` and commit its edits; if they touch the plugin or live scripts, push and repeat 3.3 on the new head
- [ ] 4.2 Run `openspec validate --strict --all`
- [ ] 4.3 Run `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`

## 5. Deliver

- [ ] 5.1 `agent-process archive_change kp-card-trailers`, then `gh pr create --title "feat: kp-card-trailers" --body-file <report>`, `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`
- [ ] 5.2 After every corrective push that changes `plugins/kp-reactions-fix.js`, repeat 3.3 on the new head before `wait_for_pr` (design Migration / Rollback, step 1)
- [ ] 5.3 In the final message, give the person the optional re-pin to `@<merge sha>` and the rollback sha (design Migration / Rollback, steps 2–3)

## Scenario → test map

| Scenario | Test |
|---|---|
| Трейлер найден | `videos and reactions added for found movie`, `oncomplite called once`; live `tests/live/kp-trailers.sh` step 1 |
| Сериал | `tv match requests videos and reactions as tv` |
| Нет imdb_id | `no imdb_id completes without tmdb calls` |
| TMDB не нашёл тайтл | `no find match completes without videos` |
| Видео не пришли | `empty videos warns with method and id` |
| Запуск трейлера пультом | live `tests/live/kp-trailers.sh` steps 2–3 (manual, not in CI) |
