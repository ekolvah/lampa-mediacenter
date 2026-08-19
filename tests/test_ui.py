"""Тесты чистой логики tools/ui.py — разбор сценария нажатий и именованные маршруты.

Не требуют устройства: send_keyevent()/run_keys()/read_state() ходят по adb/CDP
и здесь не проверяются.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from ui import ROUTES, parse_keys, resolve_route  # noqa: E402


def test_parse_keys_single_press() -> None:
    assert parse_keys("BACK") == [("KEYCODE_BACK", 1)]


def test_parse_keys_keeps_existing_prefix() -> None:
    assert parse_keys("KEYCODE_BACK") == [("KEYCODE_BACK", 1)]


def test_parse_keys_with_repeat() -> None:
    assert parse_keys("DPAD_DOWN x3") == [("KEYCODE_DPAD_DOWN", 3)]


def test_parse_keys_sequence() -> None:
    assert parse_keys("BACK,BACK,DPAD_DOWN x3,DPAD_CENTER") == [
        ("KEYCODE_BACK", 1),
        ("KEYCODE_BACK", 1),
        ("KEYCODE_DPAD_DOWN", 3),
        ("KEYCODE_DPAD_CENTER", 1),
    ]


def test_parse_keys_rejects_empty_spec() -> None:
    with pytest.raises(ValueError, match="пустой сценарий"):
        parse_keys("")


def test_parse_keys_rejects_empty_token() -> None:
    with pytest.raises(ValueError, match="пустой токен"):
        parse_keys("BACK,,DPAD_CENTER")


def test_parse_keys_rejects_unrecognized_token() -> None:
    with pytest.raises(ValueError, match="не распознан"):
        parse_keys("DPAD_DOWN x")


def test_parse_keys_rejects_zero_repeat() -> None:
    with pytest.raises(ValueError, match="неверный повтор"):
        parse_keys("DPAD_DOWN x0")


def test_parse_keys_rejects_repeat_above_max() -> None:
    with pytest.raises(ValueError, match="похоже на опечатку"):
        parse_keys("DPAD_DOWN x30000")


def test_resolve_route_known() -> None:
    route = resolve_route("Настройки > Расширения")
    assert route.expect == "extensions_line"
    assert parse_keys(route.keys)  # маршрут парсится собственной же грамматикой


def test_resolve_route_unknown_lists_known_routes() -> None:
    with pytest.raises(ValueError, match="Настройки > Расширения"):
        resolve_route("нет такого")


def test_routes_all_parse() -> None:
    for route in ROUTES.values():
        assert parse_keys(route.keys)
