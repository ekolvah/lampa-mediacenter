"""Тесты PostToolUse-хука из .claude/settings.json, запущенного не из корня проекта.

Исполняется настоящая строка команды хука — ровно то, что запускает Claude Code, — во
временном «проекте» с копиями скриптов. Кред собирается конкатенацией, как в
test_ci_check.py: живое значение появляется только во временных файлах.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parent.parent
# По PATH, а не голым "bash": CreateProcess на Windows сперва смотрит в System32 и
# находит WSL, а Claude Code запускает хуки через Git Bash.
_BASH = shutil.which("bash") or "bash"
_VALUE = "Zq9" + "probeValue77"
_SECRET_LINE = "http://host/?" + "token=" + _VALUE + "\n"


def _hook_command() -> str:
    settings = json.loads((_ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))
    (entry,) = [e for e in settings["hooks"]["PostToolUse"] if e["matcher"] == "Edit|Write"]
    (hook,) = entry["hooks"]
    return str(hook["command"])


@pytest.fixture
def project(tmp_path: Path) -> Path:
    shutil.copytree(
        _ROOT / "scripts", tmp_path / "scripts", ignore=shutil.ignore_patterns("__pycache__")
    )
    (tmp_path / "snapshots").mkdir()
    (tmp_path / "snapshots" / "dump.txt").write_text(_SECRET_LINE, encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "a.md").write_text(_SECRET_LINE, encoding="utf-8")
    (tmp_path / "openspec").mkdir()
    return tmp_path


def _run_hook(project: Path, stdin: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(project), "PYTHONUTF8": "1"}
    return subprocess.run(
        [_BASH, "-c", _hook_command()],
        cwd=project / "openspec",
        input=stdin,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def _payload(path: Path) -> str:
    return json.dumps({"tool_input": {"file_path": str(path)}})


def test_settings_hook_runs_outside_root(project: Path) -> None:
    result = _run_hook(project, "{}")
    assert result.returncode == 0, result.stderr
    assert "No such file" not in result.stderr


def test_snapshot_skipped_outside_root(project: Path) -> None:
    result = _run_hook(project, _payload(project / "snapshots" / "dump.txt"))
    assert result.returncode == 0, result.stderr


def test_secret_found_outside_root(project: Path) -> None:
    result = _run_hook(project, _payload(project / "docs" / "a.md"))
    assert result.returncode == 2, result.stderr
    lines = result.stderr.splitlines()
    assert "Файл docs/a.md не проходит гейты:" in lines
    assert any(line.startswith("docs/a.md:1: ") for line in lines), result.stderr
