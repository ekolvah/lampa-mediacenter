"""Тесты безопасной записи настроек TorrServer — tools/torrserver.py.

Устройство не нужно: HTTP-транспорт заменён фейком, который воспроизводит
подтверждённую на живой приставке семантику TorrServer (см. docs/torrserver-tuning.md):
`action:set` заменяет структуру целиком, а не мёржит, и часть полей клампится
при загрузке. Именно на этой паре свойств репозиторий уже терял настройки дважды.
"""

import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from torrserver import (  # noqa: E402
    SettingsError,
    apply_changes,
    diff_settings,
    parse_assignment,
    parse_doc_table,
    verify_expected,
)

# Урезанный, но настоящий по форме объект: скалярные поля разных типов плюс вложенный
# TMDBSettings — он в реальном инциденте тоже обнулялся, и его наличие проверяет, что
# сравнение идёт по всей структуре, а не только по верхнему уровню.
_SETTINGS: dict[str, Any] = {
    "CacheSize": 209715200,
    "ReaderReadAHead": 95,
    "PreloadCache": 16,
    "ConnectionsLimit": 100,
    "PeersListenPort": 42100,
    "UseDisk": False,
    "TorrentsSavePath": "",
    "TMDBSettings": {"APIURL": "https://api.themoviedb.org", "APIKey": ""},
}

# Подтверждено на устройстве 2026-08-30: обнулённый ReaderReadAHead приезжает обратно
# не нулём, а пятёркой. Кламп — вторая половина ловушки: значение "записалось",
# но не то, которое отправляли, и ответ API об этом не сообщает.
_CLAMPS: dict[str, int] = {"ReaderReadAHead": 5}


class FakeTorrServer:
    """Транспорт с семантикой настоящего TorrServer, а не с удобной для нас."""

    def __init__(self, settings: dict[str, Any] | None = None) -> None:
        self._settings: dict[str, Any] = dict(settings or _SETTINGS)
        self.set_calls: list[dict[str, Any]] = []

    def get(self) -> dict[str, Any]:
        return dict(self._settings)

    def set(self, settings: dict[str, Any]) -> None:
        self.set_calls.append(dict(settings))
        # Замена структуры целиком: неуказанное поле получает нулевое значение Go,
        # а не сохраняет прежнее. Это и есть корень обоих инцидентов.
        replaced: dict[str, Any] = {}
        for key, old in self._settings.items():
            if key in settings:
                replaced[key] = settings[key]
            elif isinstance(old, bool):
                replaced[key] = False
            elif isinstance(old, int):
                replaced[key] = 0
            elif isinstance(old, str):
                replaced[key] = ""
            elif isinstance(old, dict):
                replaced[key] = dict.fromkeys(old, "")
            else:
                replaced[key] = None
        for key, floor in _CLAMPS.items():
            if key in replaced and isinstance(replaced[key], int) and replaced[key] < floor:
                replaced[key] = floor
        self._settings = replaced


def test_fake_reproduces_partial_set_wipe() -> None:
    """Характеризационный: фейк обязан быть опасным так же, как настоящий сервер.

    Если этот тест позеленеет «сам собой», значит фейк перестал моделировать
    угрозу и все остальные тесты в файле больше ничего не доказывают.
    """
    fake = FakeTorrServer()
    fake.set({"CacheSize": 209715200, "PreloadCache": 16})
    after = fake.get()
    assert after["ConnectionsLimit"] == 0
    assert after["TMDBSettings"]["APIURL"] == ""
    # 0 → кламп: ровно то, что случилось с ReaderReadAHead 30.08.
    assert after["ReaderReadAHead"] == 5


def test_apply_preserves_untouched_fields() -> None:
    fake = FakeTorrServer()
    apply_changes(fake, {"ReaderReadAHead": 95})
    after = fake.get()
    assert after["ConnectionsLimit"] == 100
    assert after["TMDBSettings"]["APIURL"] == "https://api.themoviedb.org"
    assert after["PreloadCache"] == 16


def test_apply_fails_on_clamp() -> None:
    """Регресс-тест на инцидент 2026-08-30: молчаливый кламп обязан быть отказом.

    Просим значение ниже минимума — сервер запишет 5 и отчитается успехом.
    Инструмент должен упасть, назвав поле и фактически записанное значение.
    """
    fake = FakeTorrServer()
    with pytest.raises(SettingsError, match="ReaderReadAHead"):
        apply_changes(fake, {"ReaderReadAHead": 3})


def test_apply_reports_collateral_change() -> None:
    """Если сервер тронул поле, которого мы не просили, — отказ, а не тишина."""

    class LeakyServer(FakeTorrServer):
        def set(self, settings: dict[str, Any]) -> None:
            super().set(settings)
            self._settings["ConnectionsLimit"] = 25

    fake = LeakyServer()
    with pytest.raises(SettingsError, match="ConnectionsLimit"):
        apply_changes(fake, {"PreloadCache": 20})


def test_unknown_field_rejected() -> None:
    """Опечатка в имени не должна создавать новое поле молча."""
    fake = FakeTorrServer()
    with pytest.raises(SettingsError, match="ReaderReadAhead"):
        apply_changes(fake, {"ReaderReadAhead": 95})
    assert fake.set_calls == []


def test_type_mismatch_rejected() -> None:
    fake = FakeTorrServer()
    with pytest.raises(SettingsError, match="тип"):
        apply_changes(fake, {"ReaderReadAHead": "95"})
    assert fake.set_calls == []


def test_apply_is_noop_when_value_already_set() -> None:
    """Повторный прогон не должен ни падать, ни трогать сервер."""
    fake = FakeTorrServer()
    changed = apply_changes(fake, {"ReaderReadAHead": 95})
    assert changed == {}
    assert fake.set_calls == []


def test_parse_assignment_takes_type_from_current_value() -> None:
    assert parse_assignment(_SETTINGS, "ReaderReadAHead=95") == ("ReaderReadAHead", 95)
    assert parse_assignment(_SETTINGS, "UseDisk=true") == ("UseDisk", True)
    assert parse_assignment(_SETTINGS, "TorrentsSavePath=/mnt") == ("TorrentsSavePath", "/mnt")
    with pytest.raises(SettingsError, match="целое"):
        parse_assignment(_SETTINGS, "ReaderReadAHead=много")


def test_diff_settings_walks_nested_objects() -> None:
    before = {"A": 1, "TMDBSettings": {"APIURL": "https://x", "APIKey": ""}}
    after = {"A": 1, "TMDBSettings": {"APIURL": "", "APIKey": ""}}
    assert diff_settings(before, after) == {"TMDBSettings.APIURL": ("https://x", "")}


def test_verify_detects_drift() -> None:
    """Расхождение живого устройства с эталоном обязано быть видимым."""
    fake = FakeTorrServer()
    fake._settings["ReaderReadAHead"] = 5
    problems = verify_expected(fake.get(), {"ReaderReadAHead": 95, "CacheSize": 209715200})
    assert len(problems) == 1
    assert "ReaderReadAHead" in problems[0]
    assert "95" in problems[0] and "5" in problems[0]


def test_verify_ignores_unmanaged_fields() -> None:
    """Поля вне эталона — не наша зона ответственности, ложных тревог быть не должно."""
    fake = FakeTorrServer()
    assert verify_expected(fake.get(), {"ReaderReadAHead": 95}) == []


def test_verify_reports_missing_field() -> None:
    """Поле есть в эталоне, но не в ответе сервера — тоже расхождение, а не тишина."""
    problems = verify_expected({"CacheSize": 1}, {"EnableIPv6": False})
    assert len(problems) == 1
    assert "EnableIPv6" in problems[0]


_DOC_TABLE = """
| Параметр | Значение | Зачем |
| --- | --- | --- |
| `ConnectionsLimit` | **100** | было 25 — упор подтверждён логом. |
| `CacheSize` | **209715200** (200 МБ) | было 64 МБ. |
| `DisableUPNP`/`DisableDHT`/`DisablePEX` | все `false` | дефолты MatriX. |

Как менялось — снапшоты `2026-08-22_torrserver-cache-size`.
"""


def test_parse_doc_table_reads_bold_and_shared_values() -> None:
    assert parse_doc_table(_DOC_TABLE) == {
        "ConnectionsLimit": 100,
        "CacheSize": 209715200,
        "DisableUPNP": False,
        "DisableDHT": False,
        "DisablePEX": False,
    }


def test_parse_doc_table_stops_at_table_end() -> None:
    """Строка про снапшоты содержит бэктики, но параметром не является."""
    assert "2026-08-22_torrserver-cache-size" not in parse_doc_table(_DOC_TABLE)
