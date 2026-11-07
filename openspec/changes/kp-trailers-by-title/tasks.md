## 0. Delivery start

- [x] 0.1 Run `agent-process start_change kp-trailers-by-title --planner Claude --implementer Claude` (tracking issue 47); verify it prints the worktree path, then `EnterWorktree` there

## 1. RED

- [x] 1.1 In `tests/js/kp-reactions-fix.test.js` make the `tmdb.get` double answer by URL prefix (`find/` / `search/`) and record URL and cache (design 8); card fixtures copy the KP fields from the table in proposal **Why**, search answers copy the TMDB results listed there; write the tests in the map below; rename the two old tests as design 8 says; add the single-request assertion to `find error warns with imdb_id, card opens` (design 6)
- [x] 1.2 Run `agent-process check_red tests/test_plugin_js.py::test_plugin_js`; verify the failing tests are exactly the map's tests for the scenarios of requirement «Поиск тайтла по названию» plus `no imdb_id searches by title and year` and `empty find falls back to title search`, and all other tests pass; commit RED with the ticks

## 2. Plugin

- [x] 2.1 On empty `imdb_id` or empty `find` result: build `{method, year}` from `movie` (design 2), call `tmdb.get('search/<method>?query=<encoded title>[&<yearKey>=<year>]', {}, ok, err, {life: WEEK})` (design 1, 5); copy `normalizeTitle` from `kp_source.js:350–364` and match by equality of normalized title sets (design 3); with a year take the first match, without a year only a single match (design 5); pass `{method, id}` to `enrich`; `find` error path unchanged (design 6); update the header comment; verify `node --check plugins/kp-reactions-fix.js`
- [x] 2.2 One `console.warn('kp-reactions-fix: no title match', reason, title, year)` for no match, ambiguous match without year and search error (design 7); verify `python -m pytest tests/test_plugin_js.py` is green; commit

## 3. Live check and docs

- [x] 3.1 Move the card opener of `open-card.js` into `openCard(id)` in new `tests/live/kp-trailers/lib.js`; add `tests/live/kp-trailers/open-card-no-imdb.js` and call it in `tests/live/kp-trailers.sh` after `restart_lampa`, before step 1 (design 9); verify `bash -n tests/live/kp-trailers.sh`; commit
- [ ] 3.2 Ask the person whether the TV is free and ADB is on; push the branch; run step 1 of design Migration / Rollback (snapshot, re-pin plugin URL to the branch head sha); verify `bash tests/live/kp-trailers.sh` exits 0
- [x] 3.3 In `docs/lampa-config-review.md:132` replace «У карточек без `imdb_id` трейлеров нет» with the title search (year when present, single match without it) and its warnings; verify `python scripts/ci_check.py --only links`; commit separately (docs only)

## 4. Verify

- [ ] 4.1 Run `/simplify` and commit its edits; if they touch the plugin or live scripts, push and repeat 3.2 on the new head
- [ ] 4.2 Run `openspec validate --strict --all`
- [ ] 4.3 Run `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`

## 5. Deliver

- [ ] 5.1 `agent-process archive_change kp-trailers-by-title`, then `gh pr create --title "feat: kp-trailers-by-title" --body-file <report>` (report references #47 and #48 as plain references), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`
- [ ] 5.2 After every corrective push that changes `plugins/kp-reactions-fix.js`, repeat 3.2 on the new head before `wait_for_pr`
- [ ] 5.3 In the final message, give the person the optional re-pin to `@<merge sha>` and the rollback URL from the snapshot (design Migration / Rollback, steps 2–3)

## Scenario → test map

| Scenario | Test |
|---|---|
| Трейлер найден | `videos and reactions added for found movie`, `oncomplite called once`; live `tests/live/kp-trailers.sh` step 1 |
| Сериал | `tv match requests videos and reactions as tv` |
| Нет imdb_id | `no imdb_id searches by title and year` (also asserts no `find/` URL); live `open-card-no-imdb` step |
| TMDB не нашёл тайтл | `empty find falls back to title search` |
| Совпадение не первым результатом | `title match skips first result with other title` |
| Совпадение по оригинальному названию | `original title matches when russian differs` |
| Сравнение без регистра, ё и пунктуации | `title match ignores case, yo and punctuation` |
| Сериал ищется среди сериалов | `tv card searches tv by first air date year` |
| Нет года, совпадение одно | `no year single match searches without year` |
| Нет года, совпадений несколько | `no year ambiguous title warns, no videos` |
| Нет совпадения названия | `no title match warns with title and year` |
| Поиск не удался | `search error warns with title and year, card opens` |
