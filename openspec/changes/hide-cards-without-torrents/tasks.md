## 0. Delivery start

- [x] 0.1 Run `agent-process start_change hide-cards-without-torrents --planner Claude --implementer Claude` (tracking issue 39); verify it prints the worktree path, then `EnterWorktree` there

## 1. RED

- [x] 1.1 Write `tests/js/torrent-quality-badge.test.js` (tests named in the map below) and `tests/test_plugin_js.py::test_plugin_js` (runs `node --test "tests/js/*.test.js"` without a shell, fails with a message when `node` is absent; design 9)
- [x] 1.2 Run `agent-process check_red tests/test_plugin_js.py::test_plugin_js`; verify it fails with `ReferenceError: window is not defined` from requiring the plugin; commit RED with the ticks

## 2. Pure function

- [x] 2.1 Add `focusTarget(index, count)`, export via `module.exports` only when `module` exists, and skip the whole startup block at the end of the file there (design 6); verify `python -m pytest tests/test_plugin_js.py` is green and `node --check plugins/torrent-quality-badge.js` passes
- [x] 2.2 Commit

## 3. DOM wiring

- [x] 3.1 Pass `e.line` through `enqueue` to the verdict callback
- [x] 3.2 `applyVerdict(line, item, miss)`: `miss` → queue the item for the line's single microtask pass; otherwise nothing (design 4, 7)
- [x] 3.3 Removal step — only items whose `data` is in `data.results`; splice `items`/`data.results`, `item.destroy()`, fix `active` and `last` via `focusTarget`, then one `emit('scroll')`, and when the line owns the controller `collectionSet` + `collectionFocus(line.last)` if the focused card was removed (design 1–3)
- [ ] 3.4 Locate the cause of focus landing nowhere after the last card of a focused row is removed (design Risks): log the navigator collection and `line.last` at `collectionFocus` across 10 emptied rows on the device via `cdp.py`; fix by the named cause; verify 10 of 10 runs end with focus on «Ещё»
- [x] 3.5 Missing `line.items`/`line.data.results`/`line.emit` → `markMiss` and one `console.warn` per line (design Risks, §IV)
- [x] 3.6 Turn `window.torrent_quality_badge_plugin` into `{ applyVerdict, verdictKey }` (design 7); commit

## 4. Live check

- [ ] 4.1 Write `tests/live/hide-cards.sh` with steps 1–5 of design 8 (`cdp.py` for setup and asserts, `ui.py --keys "DPAD_RIGHT,DPAD_LEFT x2" --expect items_line` for real keys)
- [ ] 4.2 Push the branch; snapshot per `docs/snapshots-convention.md`; switch the plugin URL to `@<branch head sha>` via `cdp.py`; force-stop and restart Lampa; run `bash tests/live/hide-cards.sh`, verify exit 0; then switch the plugin URL back to the sha from the snapshot, force-stop, restart and check by `screencap` that Главная renders (CLAUDE.md, после живого тестирования)
- [ ] 4.3 Document the JS tests and the live check in `docs/quality-gates.md`; verify `python scripts/ci_check.py --only links`; commit

## 5. Verify

- [ ] 5.1 Run `/simplify` and commit its edits; if they touch the plugin, push, snapshot, re-point the plugin URL to the new head sha, re-run `bash tests/live/hide-cards.sh`, then restore the sha from the snapshot
- [ ] 5.2 Run `openspec validate --strict --all`
- [ ] 5.3 Run `pre-commit run --hook-stage manual --all-files`

## 6. Deliver

- [ ] 6.1 `agent-process archive_change hide-cards-without-torrents`, then `gh pr create --title "feat: hide-cards-without-torrents" --body-file <report>`, `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`
- [ ] 6.2 After the person merges: snapshot, switch the plugin URL `<sha>` to the merge commit via `cdp.py`, restart Lampa, run `bash tests/live/hide-cards.sh` on the deployed sha; rollback = sha from the snapshot

## Scenario → test map

| Scenario | Test |
|---|---|
| Нет раздач под фильтр | live `tests/live/hide-cards.sh` steps 1, 2 |
| Раздачи есть | live `tests/live/hide-cards.sh` step 1 (`miss: false` card stays) |
| Фильтр не активен | n/a: ранний выход по `filterActive` до `applyVerdict` не меняется |
| Поиск раздач не удался | n/a: ветка `results === null` в `finishTask` не вызывает `applyVerdict` и не меняется |
| Фильм без раздач в Избранном | live `tests/live/hide-cards.sh` step 5 |
| Скрыта одна карточка | live `tests/live/hide-cards.sh` step 2 |
| Следующая карточка тоже без раздач | live `tests/live/hide-cards.sh` step 3 |
| Результаты ряда кончились | live `tests/live/hide-cards.sh` step 3 |
| Все карточки ряда без раздач | live `tests/live/hide-cards.sh` step 4 |
| Скрывается карточка под фокусом | `focusTarget picks next`, `focusTarget falls back to previous`, `focusTarget none in empty row`; live `tests/live/hide-cards.sh` steps 2, 4 |
