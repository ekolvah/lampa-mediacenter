#!/usr/bin/env python3
"""PostToolUse-хук Claude Code: проверяет ровно тот файл, который агент только что записал.

Смысл — сократить петлю обратной связи: полный `scripts/ci_check.py` агент запускает
перед коммитом, а тут дешёвая часть, осмысленная для одного файла, срабатывает сразу
после правки. Код возврата 2 — единственный, который Claude Code отдаёт модели как
блокирующее замечание (stdout при 0 она не видит), поэтому находка = exit 2.

Хук не подменяет гейт: набор шаблонов секретов и правила ruff берутся из ci_check.py
и pyproject.toml, второго определения качества здесь нет.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_check import scan_device_secrets  # noqa: E402  (после правки sys.path)

_SKIP_PREFIXES = ("snapshots/",)


def _payload() -> dict[str, object]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Хук получил не то, что ожидал: молча выйти нельзя — иначе гейт «работает»,
        # ничего не проверяя. Сообщаем оператору и не блокируем правку.
        print("claude_hook: stdin не разобран как JSON — файл не проверен", file=sys.stderr)
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _target(payload: dict[str, object]) -> Path | None:
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return None
    file_path = tool_input.get("file_path")
    if not isinstance(file_path, str) or not file_path:
        return None
    path = Path(file_path)
    return path if path.is_file() else None


def _relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _ruff(args: list[str], name: str) -> list[str]:
    proc = subprocess.run(
        [sys.executable, "-m", "ruff", *args, name],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode == 0:
        return []
    return [(proc.stdout + proc.stderr).strip()]


def main() -> int:
    target = _target(_payload())
    if target is None:
        return 0
    name = _relative(target)
    if name.startswith(_SKIP_PREFIXES):
        # Выгрузки устройства — не наш код и легально содержат креды (см. ci_check).
        return 0

    problems: list[str] = []
    if name.endswith(".py"):
        problems += _ruff(["format", "--check"], name)
        problems += _ruff(["check"], name)
    problems += scan_device_secrets([name])

    if problems:
        print(f"Файл {name} не проходит гейты:", file=sys.stderr)
        for problem in problems:
            print(problem, file=sys.stderr)
        print("Полный набор: py -3.12 scripts/ci_check.py (docs/quality-gates.md)", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
