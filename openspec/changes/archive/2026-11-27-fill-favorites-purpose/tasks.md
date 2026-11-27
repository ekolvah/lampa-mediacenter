## 0. Delivery start

- [x] 0.1 `agent-process start_change fill-favorites-purpose --planner Claude --implementer Claude`
  (tracking issue 120); войти в `.claude/worktrees/fill-favorites-purpose` через `EnterWorktree`.

## 1. RED

- [x] 1.1 no RED: docs-only, `skip_specs`. Воспроизведение — proposal.md, Why:
  `openspec validate --strict --all` → `11 passed, 1 failed`.

## 2. Purpose

- [x] 2.1 `openspec/specs/favorites-across-sources/spec.md`: заменить строку `TBD - created by archiving
  change …` под `## Purpose` на «Плагин `kp-reactions-fix.js` показывает тайтл в закладках одной
  карточкой, даже если его добавили из разных источников (`tmdb`, `cub`, `KP`): записи склеиваются по
  `imdb_id`, а метка и снятие закладки действуют на все записи тайтла.»
  Проверка: `openspec validate favorites-across-sources --type spec --strict` без предупреждения о
  заглушке. Коммит группы.

## 3. Verify

- [x] 3.1 `/simplify`, коммит правок.
- [x] 3.2 `openspec validate --strict --all` → все пункты зелёные.
- [x] 3.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 4. Deliver

- [x] 4.1 `agent-process archive_change fill-favorites-purpose`, затем
  `gh pr create --title "docs: fill-favorites-purpose" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой.
- [ ] 4.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`. Не больше трёх
  раундов правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| — | — | n/a: `skip_specs`, дельт нет; требования и сценарии спеки не меняются |
