## Why

PostToolUse-хук сканера секретов (`scripts/claude_hook.py`) молча не срабатывает, когда cwd сессии
не корень репозитория (issue #78): команда в `.claude/settings.json` — `python scripts/claude_hook.py`,
путь разрешается от cwd. Тогда секреты устройства ловит только `ci_check.py` на pre-push/CI, а
репозиторий публичный.

**Воспроизведение** (2026-11-21, Git Bash, корень `Lampa`):

```
$ cd openspec && echo '{}' | python scripts/claude_hook.py; echo "relative exit=$?"
python.exe: can't open file '...\Lampa\openspec\scripts\claude_hook.py': [Errno 2] No such file or directory
relative exit=2
$ CLAUDE_PROJECT_DIR="$ROOT" bash -c 'echo "{}" | python "$CLAUDE_PROJECT_DIR/scripts/claude_hook.py"'; echo "absolute exit=$?"
absolute exit=0
```

**Второй дефект того же корня**, который правка пути вскрывает: `_relative()` считает путь файла от
cwd, поэтому исключение `snapshots/` работает только из корня. Файл снапшота с кредами, переданный
хуку из `openspec/`: из корня exit 0, из подкаталога — `Файл C:/Users/.../snapshots/2026…` и exit 2,
то есть ложная блокировка правки снапшота.

**Корневая причина** обоих: хук и его скрипт неявно предполагают cwd = корень репозитория, а Claude
Code запускает хуки в текущем каталоге сессии — «Handlers run in the current directory with Claude
Code's environment» (https://code.claude.com/docs/en/hooks, «Hook handler fields»).

## What Changes

- Команда хука в `.claude/settings.json` сначала переходит в корень проекта через
  `$CLAUDE_PROJECT_DIR`, затем запускает скрипт; исключение `snapshots/` и пути в находках перестают
  зависеть от cwd сессии. Сам скрипт не меняется.
- Новый тест `tests/test_claude_hook.py`: команда хука из `.claude/settings.json`, запущенная вне корня.

## Capabilities

### New Capabilities
- `edit-secret-hook`: проверка секретов устройства в файле сразу после его записи агентом, независимо
  от каталога сессии.

### Modified Capabilities
(нет)

## Impact

- Изменён: `.claude/settings.json` (только команда PostToolUse-хука).
- Добавлен: `tests/test_claude_hook.py`.
- Удалённых файлов нет. Доки не меняются: `docs/quality-gates.md` описывает хук без пути запуска.
