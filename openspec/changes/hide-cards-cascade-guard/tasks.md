## 0. Delivery start

- [x] 0.1 `agent-process start_change hide-cards-cascade-guard --planner Claude --implementer Claude`
  (tracking issue 85); войти в `.claude/worktrees/hide-cards-cascade-guard` через `EnterWorktree`.

## 1. RED

- [ ] 1.1 no RED: правится только живой тест, pytest-теста нет. Воспроизведение — proposal.md, Why:
  `bash tests/live/hide-cards.sh` падает на шаге 3 с «карточек N вместо 3». Перед правкой уточнить у
  пользователя, включён ли Wireless debugging и актуален ли IP приставки (CLAUDE.md), и
  воспроизвести падение на текущем `main`.

## 2. Живой тест

- [ ] 2.1 `tests/live/hide-cards/cascade-to-three.js` по design.md, решение 1: лимит цикла — длина
  `line.data.results` на входе в шаг; обновить комментарий шага.
- [ ] 2.2 Там же, решение 2: после цикла `HC.check(results.length <= 3, ...)` с числом оставшихся и
  исходных результатов — до проверки числа карточек.
  Проверка: `bash tests/live/hide-cards.sh` → `OK: hide-cards`, затем `restart_lampa` и screencap
  (CLAUDE.md, после серии `location`/`Activity`-пересборок). Коммит группы.

## 3. Verify

- [ ] 3.1 `/simplify`, коммит правок.
- [ ] 3.2 `openspec validate --strict --all`.
- [ ] 3.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 4. Deliver

- [ ] 4.1 `agent-process archive_change hide-cards-cascade-guard`, затем
  `gh pr create --title "test: hide-cards-cascade-guard" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой.
- [ ] 4.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`. Не больше трёх
  раундов правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| — | — | n/a: `skip_specs`, дельт нет. Ниже действующий сценарий, который проверяет правленый шаг |
| `card-torrent-filter` | Результаты ряда кончились | `tests/live/hide-cards.sh`, шаг 3: `cascade-to-three` |
