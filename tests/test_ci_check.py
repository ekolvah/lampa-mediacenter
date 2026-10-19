"""Тесты сканера секретов проекта из scripts/ci_check.py.

Значения собираются конкатенацией, чтобы строки этого файла не ловились тем же
сканером и detect-secrets: живой секрет появляется только во временном файле.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from ci_check import scan_device_secrets  # noqa: E402

_VALUE = "Zq9" + "probeValue77"


@pytest.mark.parametrize(
    ("line", "label"),
    [
        ("http://host/?" + "token=" + _VALUE, "токен в URL"),
        ("http://host/?" + "account_email=" + _VALUE + "%40mail.example", "почта аккаунта в URL"),
        ("http://host/?" + "uid=" + _VALUE, "uid аккаунта в URL"),
        ("pass" + "word: " + _VALUE, "пароль в открытом виде"),
    ],
)
def test_finding_locates_secret_without_printing_it(tmp_path: Path, line: str, label: str) -> None:
    # Находка уходит в публичный лог CI и в контекст агента (claude_hook): путь, строка
    # и тип секрета — да, само значение — нет.
    target = tmp_path / "leak.md"
    target.write_text(f"заголовок\n{line}\n", encoding="utf-8")
    assert scan_device_secrets([str(target)]) == [f"{target}:2: {label}"]


def test_placeholder_is_not_a_finding(tmp_path: Path) -> None:
    target = tmp_path / "doc.md"
    target.write_text("http://host/?" + "token=<токен>\n", encoding="utf-8")
    assert scan_device_secrets([str(target)]) == []
