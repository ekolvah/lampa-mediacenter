## 0. Delivery start

- [x] 0.1 `agent-process start_change fill-spec-purposes --planner Claude --implementer Claude`
  (tracking issue 88); войти в `.claude/worktrees/fill-spec-purposes` через `EnterWorktree`.

## 1. RED

- [x] 1.1 no RED: docs-only, `skip_specs`. Воспроизведение — proposal.md, Why:
  `openspec validate --strict --all` → `7 passed, 3 failed`.

## 2. Purpose

Каждая задача заменяет строку `TBD - created by archiving change …` под `## Purpose` одним
предложением. Проверка каждой: `openspec validate <spec> --type spec --strict` без предупреждения
о заглушке.

- [x] 2.1 `openspec/specs/card-buttons/spec.md`: «Плагин `kp-reactions-fix.js` открывает список
  торрентов из карточки одним нажатием: кнопка «Торренты» стоит первой в строке кнопок, а «Смотреть»
  перенесена в меню «…».»
- [x] 2.2 `openspec/specs/tmdb-access/spec.md`: «Lampa на приставке ходит в TMDB напрямую, а не через
  TMDB-прокси Lampac, который вырезает часть тайтлов, поэтому тайтл, который есть в TMDB, находится и в
  Lampa.»
- [x] 2.3 `openspec/specs/kp-main-recommendations/spec.md`: «Плагин `kp-reactions-fix.js` добавляет на
  Главную источника `KP` ряды «Рекомендуем посмотреть» для фильмов и сериалов, которых `kp_source` сам
  не строит, без уже просмотренного.»
  Коммит группы.

## 3. Verify

- [x] 3.1 `/simplify`, коммит правок.
- [x] 3.2 `openspec validate --strict --all` → все пункты зелёные.
- [x] 3.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 4. Deliver

- [x] 4.1 `agent-process archive_change fill-spec-purposes`, затем
  `gh pr create --title "docs: fill-spec-purposes" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой.
- [ ] 4.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`. Не больше трёх
  раундов правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| — | — | n/a: `skip_specs`, дельт нет; требования и сценарии трёх спек не меняются |
