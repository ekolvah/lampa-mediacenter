"""Запуск JS-тестов плагинов (tests/js/*.test.js) встроенным раннером Node."""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_plugin_js() -> None:
    node = shutil.which("node")
    assert node, "node не найден на PATH: JS-тесты плагинов не запущены"
    # Glob раскрывает сам Node (без shell); форма с каталогом на Node 22 не работает.
    proc = subprocess.run(
        [node, "--test", "tests/js/*.test.js"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
