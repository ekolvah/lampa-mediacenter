## 0. Delivery start

- [x] 0.1 `agent-process start_change fix-claude-hook-cwd --planner Claude --implementer Claude`
  (tracking issue 78), дальше работа в `.claude/worktrees/fix-claude-hook-cwd`.

## 1. RED

- [ ] 1.1 `tests/test_claude_hook.py` по карте ниже, fixture и запуск — design.md, решение 2. Кред
  собирать конкатенацией, как `_VALUE` в `tests/test_ci_check.py`.
- [ ] 1.2 `agent-process check_red tests/test_claude_hook.py::test_settings_hook_runs_outside_root
  tests/test_claude_hook.py::test_snapshot_skipped_outside_root
  tests/test_claude_hook.py::test_secret_found_outside_root`, коммит RED.

## 2. Исправление (решение 1)

- [ ] 2.1 `.claude/settings.json`: команда PostToolUse-хука
  `cd "$CLAUDE_PROJECT_DIR" && python scripts/claude_hook.py`. Проверка:
  `python -m pytest tests/test_claude_hook.py tests/test_ci_check.py`. Коммит.

## 3. Verify

- [ ] 3.1 `/simplify`, коммит его правок.
- [ ] 3.2 `openspec validate --strict --all`.
- [ ] 3.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 4. Deliver

- [ ] 4.1 `agent-process archive_change fix-claude-hook-cwd`, затем
  `gh pr create --title "fix: fix-claude-hook-cwd" --body-file <отчёт>` (issue #78 простой ссылкой,
  карта сценариев, принципы §I, §II, §VII), `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`. В отчёте — живая проверка после мерджа: новая сессия, Edit из
  подкаталога, ошибки хука нет.

## Scenario → test map

| Сценарий | Тест |
|---|---|
| Команда хука из чужого каталога | `tests/test_claude_hook.py::test_settings_hook_runs_outside_root` |
| Снапшот из подкаталога не блокируется | `tests/test_claude_hook.py::test_snapshot_skipped_outside_root` |
| Секрет из подкаталога ловится | `tests/test_claude_hook.py::test_secret_found_outside_root` (заголовок ровно `Файл docs/a.md не проходит гейты:`, строка находки `docs/a.md:1: …`) |
