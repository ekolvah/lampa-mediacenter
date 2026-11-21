## 0. Delivery start

- [x] 0.1 `agent-process start_change separate-card-module --planner Claude --implementer Claude`
  (tracking issue 93); войти в `.claude/worktrees/separate-card-module` через `EnterWorktree`.
  Тут же спросить пользователя, включён ли Wireless debugging и актуален ли IP (CLAUDE.md).

## 1. RED

- [x] 1.1 no RED: чистый рефакторинг (design.md, решение 2).

## 2. Разделение модулей (design.md, решение 1)

- [x] 2.1 Общее: вынести из `patch()` `var cub, tmdb;` и `cardName`, `releaseDate`,
  `searchByTitle`, `resolveTitle`, `lastSeason`. Проверка: `node --test tests/js/kp-reactions-fix.test.js`.
- [x] 2.2 Карточка: вынести `enrich`, `trailers`, `time`, `newest`, `putFirst`, `seasonTrailer`,
  `ruTrailer`, кнопки поставить следом. Проверка: та же.
- [x] 2.3 Заголовки модулей, шапочный комментарий разбить на абзацы «Карточка» и «Источник KP».
  Проверка: та же, `git diff --stat` — только `plugins/kp-reactions-fix.js`. Коммит группы.

## 3. Живая проверка (design.md, решение 3)

- [x] 3.1 Снапшот по `docs/snapshots-convention.md`. Запушить ветку, пин `kp-reactions-fix.js` на
  её sha. `bash tests/live/kp-trailers.sh`, `bash tests/live/now-watching.sh`,
  `bash tests/live/main-recs.sh` → `OK` каждый. `screencap` Главной, затем закрыть снапшот
  (`after/`) по конвенции.

## 4. Verify

- [x] 4.1 `/simplify`, коммит правок. Если правки задели плагин — повторить 3.1 на новом sha.
- [ ] 4.2 `openspec validate --strict --all`.
- [ ] 4.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 5. Deliver

- [ ] 5.1 `agent-process archive_change separate-card-module`, затем
  `gh pr create --title "refactor: separate-card-module" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой и называет отступление от issue.
- [ ] 5.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`. Не больше трёх
  раундов правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| — | — | n/a: `skip_specs` |
