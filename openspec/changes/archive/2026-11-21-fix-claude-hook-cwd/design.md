## Context

Мотивация и воспроизведение — proposal.md, «Why». Скрипты проекта (`scripts/ci_check.py`,
`scripts/claude_hook.py`) рассчитаны на cwd = корень: `ci_check.py` смотрит `Path("snapshots")` и
`git ls-files`, хук сверяет путь файла от cwd с `snapshots/`, а `scan_device_secrets` открывает
`Path(name)` от cwd. Pre-commit и CI их так и запускают; хук Claude Code — нет.

## Standard approach

- Claude Code для скриптов проекта в хуках показывает форму с `$CLAUDE_PROJECT_DIR`:
  `"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-rm-rf.sh"`
  (https://code.claude.com/docs/en/hooks-guide, «Combine results from multiple hooks»); переменную
  экспортируют процессу хука — «both export them as the environment variables `CLAUDE_PROJECT_DIR`…»
  (https://code.claude.com/docs/en/hooks, «Exec form and shell form»).
- Оболочка хука: «Defaults to `"bash"`, or to `"powershell"` on Windows when Git Bash isn't
  installed» (там же, «Command hook fields»). На этой машине Git Bash есть; SessionStart-хук того же
  `.claude/settings.json` уже раскрывает `$CLAUDE_PROJECT_DIR`.
- Наблюдение: из `openspec/`
  `CLAUDE_PROJECT_DIR="$(cygpath -w "$ROOT")" bash -c 'cd "$CLAUDE_PROJECT_DIR" && pwd && echo "{}" | python scripts/claude_hook.py'`
  печатает `/c/Users/jadow/PycharmProjects/Lampa` и exit 0 — `cd` в Git Bash принимает Windows-путь.

## Goals / Non-Goals

**Goals:** хук проверяет записанный файл при любом cwd сессии; исключение `snapshots/` и пути в
находках — как при запуске из корня.

**Non-Goals:** независимость самих скриптов от cwd (правило проекта — их запускают из корня);
расхождение `_SKIP_PREFIXES` хука с `_SNAPSHOT_DATA` в `ci_check.py`; запуск хуков через PowerShell.

## Decisions

1. **Команда хука — `cd "$CLAUDE_PROJECT_DIR" && python scripts/claude_hook.py`, скрипт не меняется.**
   Одна строка закрывает оба дефекта: и поиск скрипта, и сверку с `snapshots/`, и чтение файла
   сканером; находки печатаются тем же путём от корня, что у `ci_check.py` на pre-push/CI (§VII).
   Альтернатива — `python "$CLAUDE_PROJECT_DIR/scripts/claude_hook.py"` (предложение issue, запись
   как у SessionStart): находит скрипт, но оставляет `_relative()` от cwd, и снапшот из подкаталога
   блокируется (proposal.md, «Why»); пришлось бы ещё `os.chdir` в корень внутри скрипта — две правки
   вместо одной. Альтернатива — два имени файла в скрипте (от корня для `snapshots/`, абсолютное для
   сканера): лишнее состояние, абсолютные пути с домашним каталогом в находках.
2. **Все три теста исполняют настоящую строку из `.claude/settings.json`** через `bash -c` с
   `CLAUDE_PROJECT_DIR` = временный «проект» (копии `scripts/claude_hook.py` и `scripts/ci_check.py`,
   файлы с кредом в `snapshots/` и `docs/`) и cwd = его подкаталог. Проверяется ровно то, что
   исполняет Claude Code, без подмены внутренних функций (§II) и без настоящего `snapshots/`,
   которого в CI нет; один fixture на все тесты.

## Risks / Trade-offs

- [Без Git Bash на Windows хук пойдёт через PowerShell, где `$CLAUDE_PROJECT_DIR` не раскроется] →
  тот же риск уже у SessionStart-хука; при отказе Claude Code показывает ошибку хука, молчаливого
  пропуска нет.
- [В worktree-сессии `CLAUDE_PROJECT_DIR` может указывать на основную копию] → хук берёт скрипт
  оттуда, а файл из worktree проверяет по абсолютному пути из payload; снапшоты живут только в
  основной копии (`snapshots/` в `.gitignore`).
- [Тесты зовут `bash`; на Windows вне Git Bash это может быть WSL] → тесты уже так делают
  (`tests/test_chroot_start.py`), гейт гоняется из Git Bash/CI.

## Migration Plan

Правка вступает в силу с новой сессии Claude Code после мерджа (хуки читаются при старте). Откат —
revert PR. Живая проверка после мерджа — шаг из issue: из подкаталога записать файл через Edit/Write,
ошибки хука нет.
