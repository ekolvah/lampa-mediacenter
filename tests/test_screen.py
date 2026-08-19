"""Тесты чистой логики tools/screen.py — разбор uiautomator dump и форматирование Lampa.

Не требуют устройства: dump_android()/dump_lampa() ходят по adb/CDP и здесь не проверяются.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from screen import format_android, format_lampa  # noqa: E402

_UIAUTOMATOR_XML = """<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" focused="false" bounds="[0,0][1920,1080]">
<node index="0" text="Настройки" resource-id="" class="android.widget.TextView" content-desc="" focused="false" bounds="[0,0][100,50]" />
<node index="1" text="" resource-id="" class="android.widget.ImageButton" content-desc="Экран" focused="true" bounds="[0,50][100,100]" />
</node>
</hierarchy>"""


def test_format_android_extracts_focused_and_visible_text() -> None:
    out = format_android(_UIAUTOMATOR_XML)
    assert "фокус: Экран" in out
    assert "Настройки" in out
    assert "видимый текст (2)" in out


def test_format_android_rejects_output_without_xml() -> None:
    with pytest.raises(ValueError, match="нет XML"):
        format_android("uiautomator: not found")


def test_format_android_redacts_secret_in_text() -> None:
    xml = _UIAUTOMATOR_XML.replace("Настройки", "token=abcdefgh12345678")  # secret-ok
    out = format_android(xml)
    assert "abcdefgh12345678" not in out
    assert "<redacted>" in out


def test_format_lampa_renders_fields() -> None:
    data = {
        "controller": "items_line",
        "title": "Главная - KP",
        "focused": "Тёмная материя",
        "cards": ["Фильм А", "Фильм Б"],
        "card_count": 40,
    }
    out = format_lampa(data)
    assert "controller=items_line" in out
    assert "заголовок: Главная - KP" in out
    assert "фокус: Тёмная материя" in out
    assert "40 всего, показаны первые 2" in out
    assert "Фильм А, Фильм Б" in out


def test_format_lampa_redacts_secret_in_card_title() -> None:
    data = {
        "controller": None,
        "title": None,
        "focused": None,
        "cards": ["account_email=ivan@gmail.com"],  # secret-ok
        "card_count": 1,
    }
    out = format_lampa(data)
    assert "ivan@gmail.com" not in out
    assert "gmail.com" not in out  # весь домен, не только до "@"


def test_format_android_redacts_uid_without_url_prefix() -> None:
    # В live-тексте (content-desc, а не URL) перед "uid=" нет "?"/"&" — в отличие от
    # ci_check.scan_device_secrets, здесь это не повод пропустить значение.
    uid = "abcde12345"  # secret-ok  # pragma: allowlist secret
    xml = _UIAUTOMATOR_XML.replace("Настройки", f"uid={uid}")
    out = format_android(xml)
    assert uid not in out
