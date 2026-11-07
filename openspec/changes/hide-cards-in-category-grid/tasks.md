## 0. Delivery start

- [x] 0.1 Run `agent-process start_change hide-cards-in-category-grid --planner Claude --implementer Claude` (tracking issue 42); verify it prints the worktree path, then `EnterWorktree` there

## 1. RED

- [ ] 1.1 Add to `tests/js/torrent-quality-badge.test.js` the tests named in the map below; grid tests use a `fullGrid()` factory next to `fullLine()` (`items`, `pages`, `last`, `active`, `loaded`, `object.page`, `total_pages`, `builded_time`, `params.items.cols`, `emit` recording events, `scroll.render`) and a `global.Lampa` double with `Controller.own`/`collectionSet`/`collectionFocus`
- [ ] 1.2 Add row-pass tests `row pass removes card from results and items` and `row pass moves focus to neighbour` (export `removeMisses` under Node if needed); verify they pass on the current plugin before any refactor (design 3)
- [ ] 1.3 Run `agent-process check_red tests/test_plugin_js.py::test_plugin_js`; verify it fails on the missing grid exports, grid pass and activity handler, not on the row-pass tests; commit RED with the ticks

## 2. Shared pass

- [ ] 2.1 `gridShortage(count, active, cols)`, `LINE`/`GRID` adapters with `supported` (`gridSupported` table-tested like `lineSupported`), exported under Node (design 2, 6)
- [ ] 2.2 Parameterize `removeMisses`/`removeItem` by the adapter: `before`, `detach`, shared splice/`last`/`destroy`, shared `active` and focus block, `refill` (design 3); row behaviour unchanged — verify the existing row tests stay green
- [ ] 2.3 `torrent_badge_kind` on the owner; `applyVerdict` checks `kind.supported`, an owner without kind gets the grey mark and one warning, `flushMisses` passes the adapter (design 2)
- [ ] 2.4 `GRID.before`: hold the last card, grey it, re-submit on the next `onAppend` (design 4)
- [ ] 2.5 `refill(grid)`: feed `loaded` while short, then `loadNext` under `GRID_AUTO_PAGES`, one timer at `builded_time + 1000 − now` while the grid is in the document (design 5); verify `python -m pytest tests/test_plugin_js.py` green and `node --check plugins/torrent-quality-badge.js`; commit

## 3. Entry point

- [ ] 3.1 `Lampa.Listener.follow('activity')` with the handler exported under Node: on `init` of `category_full` set `torrent_badge_kind = GRID` and attach `onAppend`, batching items per microtask into `onLineEvent({line: grid, items})` then `refill` only while `filterActive`; no `use` → one `console.warn` via `torrent_badge_warned` (design 1); verify `python -m pytest tests/test_plugin_js.py` green; commit

## 4. Live check

- [ ] 4.1 `tests/live/hide-cards/lib.js`: `HC.owner()` and owner-agnostic `HC.cards`/`HC.focusedCard`; make `warm-cache.js`, `hide-focused.js`, `focus-in-row.js` use it; add `grid-open.js`, `grid-refill.js`, `grid-hide-all.js`, `grid-favorite.js` and steps 6–10 plus the `grid` argument to `tests/live/hide-cards.sh` (design 8)
- [ ] 4.2 Push the branch; snapshot per `docs/snapshots-convention.md`; switch the plugin URL to `@<branch head sha>` via `cdp.py`; force-stop and restart Lampa; run `bash tests/live/hide-cards.sh`, verify exit 0; switch the URL back to the sha from the snapshot, force-stop, restart and check by `screencap` that Главная renders (CLAUDE.md, после живого тестирования)
- [ ] 4.3 `docs/quality-gates.md`: the live check covers rows and the category grid, `grid` runs only the grid; verify `python scripts/ci_check.py --only links`; commit

## 5. Verify

- [ ] 5.1 Run `/simplify` and commit its edits; if they touch the plugin, push, snapshot, re-point the plugin URL to the new head sha, re-run `bash tests/live/hide-cards.sh`, then restore the sha from the snapshot
- [ ] 5.2 Run `openspec validate --strict --all`
- [ ] 5.3 Run `pre-commit run --hook-stage manual --all-files`

## 6. Deliver

- [ ] 6.1 `agent-process archive_change hide-cards-in-category-grid`, then `gh pr create --title "feat: hide-cards-in-category-grid" --body-file <report>`, `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`
- [ ] 6.2 After the person merges: snapshot, switch the plugin URL `<sha>` to the merge commit via `cdp.py`, restart Lampa, run `bash tests/live/hide-cards.sh` on the deployed sha; rollback = sha from the snapshot

## Scenario → test map

| Scenario | Test |
|---|---|
| Нет раздач под фильтр | `row pass removes card from results and items`; live `tests/live/hide-cards.sh` steps 1, 2 |
| Нет раздач под фильтр в сетке категории | `activity attaches only to category_full init`, `grid appends batched into one onLineEvent`, `grid pass removes card from items and pages`, `applyVerdict without kind greys and warns once`, `activity warns once without use`; live steps 6, 7 |
| Раздачи есть | live steps 1, 6 (cards with `miss: false` stay) |
| Фильтр не активен | `grid append with filter off enqueues nothing and loads no page` |
| Поиск раздач не удался | n/a: ветка `results === null` в `finishTask` не вызывает `applyVerdict` и не меняется |
| Фильм без раздач в Избранном | live step 5 |
| Сетка Избранного | live step 10 |
| Скрывается карточка под фокусом | `row pass moves focus to neighbour`, `focusTarget picks next`, `focusTarget falls back to previous`, `focusTarget none in empty row`; live steps 2, 4 |
| Скрывается карточка под фокусом в сетке | `grid pass moves last and active to neighbour`; live step 7 |
| Видимая часть неполна | `gridShortage counts from active row start`, `gridShortage false with two full rows`, `grid refill feeds loaded then loadNext`, `grid refill waits out loadNext guard`; live step 8 |
| Предел автодогрузки | `grid refill stops at auto page limit` |
| Все карточки загруженных страниц без раздач | `grid pass keeps last card grey`, `grid held card resubmitted on next append`; live step 9 |
| Страницы кончились | `grid pass keeps last card grey` |
