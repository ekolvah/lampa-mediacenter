"""Безопасная правка настроек TorrServer на приставке — вместо ручного curl.

    python tools/torrserver.py get
    python tools/torrserver.py set ReaderReadAHead=95 [--verify-restart]

Зачем инструмент, если метод описан в docs/torrserver-tuning.md словами: `action:set`
у TorrServer **заменяет структуру целиком**, а не мёржит присланный объект, и часть
полей молча клампится при загрузке. Собранный руками `sets` дважды обнулял соседние
поля (см. историю в snapshots/2026-08-30_*), причём второй раз — незаметно на четыре
часа, потому что проверяли «стало ли нужное поле нужным», а не diff всего объекта.

Поэтому здесь запись обставлена постусловием: get → правка полного объекта → set →
повторный get → **diff до/после обязан совпасть с запрошенным множеством полей и
значений**. Одно условие ловит обе ловушки сразу: побочно обнулённое поле окажется
в diff лишним, а заклампленное значение — отличным от отправленного. Знать список
клампов заранее для этого не нужно.

С хоста нужен проброс порта:
    MSYS_NO_PATHCONV=1 adb -s <ip>:5555 forward tcp:18090 tcp:8090
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Protocol

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from ci_check import force_utf8_output  # noqa: E402

# Русские сообщения на cp1252-консоли Windows иначе роняют скрипт UnicodeEncodeError —
# и роняют, в частности, успешный путь, из-за чего удавшаяся запись выглядит как отказ.
force_utf8_output()

_PACKAGE = "ru.yourok.torrserve"
_ACTIVITY = f"{_PACKAGE}/.ui.activities.main.MainActivity"


class SettingsError(Exception):
    """Отказ записи: некорректный запрос либо сервер записал не то, что просили."""


class SettingsTransport(Protocol):
    """Минимум, который нужен apply_changes — чтобы тесты шли без устройства."""

    def get(self) -> dict[str, Any]: ...

    def set(self, settings: dict[str, Any]) -> None: ...


class HttpTransport:
    """Настоящий TorrServer через `adb forward`."""

    def __init__(self, port: int) -> None:
        self._url = f"http://127.0.0.1:{port}/settings"

    def _post(self, payload: dict[str, Any]) -> str:
        request = urllib.request.Request(
            self._url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body: str = response.read().decode()
                return body
        except (urllib.error.URLError, TimeoutError) as exc:
            raise SettingsError(
                f"TorrServer не отвечает на {self._url}: {exc}. Движок ленивый — он поднят "
                "только пока идёт воспроизведение; проверь adb forward и что приложение запущено."
            ) from exc

    def get(self) -> dict[str, Any]:
        body = self._post({"action": "get"})
        try:
            settings: dict[str, Any] = json.loads(body)
        except json.JSONDecodeError as exc:
            raise SettingsError(f"action:get вернул не JSON: {body[:200]!r}") from exc
        return settings

    def set(self, settings: dict[str, Any]) -> None:
        # Ответ на set у MatriX пустой — тело не разбираем принципиально: единственная
        # достоверная проверка результата это повторный get, см. docstring модуля.
        self._post({"action": "set", "sets": settings})


def parse_assignment(current: dict[str, Any], text: str) -> tuple[str, Any]:
    """Разобрать `Поле=значение`, взяв тип из текущего значения этого поля.

    Тип не угадывается по виду строки: `PeersListenPort=0` должен остаться числом,
    а не превратиться в строку, поэтому эталон типа — то, что сейчас лежит на сервере.
    """
    name, separator, raw = text.partition("=")
    if not separator:
        raise SettingsError(f"ожидалось Поле=значение, получено {text!r}")
    if name not in current:
        raise SettingsError(f"поля {name!r} нет в настройках TorrServer (опечатка?)")

    reference = current[name]
    if isinstance(reference, bool):
        if raw not in ("true", "false"):
            raise SettingsError(f"{name}: ожидалось true/false, получено {raw!r}")
        return name, raw == "true"
    if isinstance(reference, int):
        try:
            return name, int(raw)
        except ValueError as exc:
            raise SettingsError(f"{name}: ожидалось целое, получено {raw!r}") from exc
    if isinstance(reference, str):
        return name, raw
    raise SettingsError(
        f"{name}: значение типа {type(reference).__name__} этим инструментом не правится"
    )


def diff_settings(before: dict[str, Any], after: dict[str, Any]) -> dict[str, tuple[Any, Any]]:
    """Расхождения между двумя объектами настроек, включая вложенные (TMDBSettings)."""
    changes: dict[str, tuple[Any, Any]] = {}
    for key in sorted(set(before) | set(after)):
        old, new = before.get(key), after.get(key)
        if isinstance(old, dict) and isinstance(new, dict):
            for sub, pair in diff_settings(old, new).items():
                changes[f"{key}.{sub}"] = pair
        elif old != new:
            changes[key] = (old, new)
    return changes


def _validate(current: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """Отсеять опечатки и несовпадение типов до того, как что-то уйдёт на сервер."""
    pending: dict[str, Any] = {}
    for name, value in changes.items():
        if name not in current:
            raise SettingsError(f"поля {name!r} нет в настройках TorrServer (опечатка?)")
        reference = current[name]
        # isinstance(True, int) — истина, поэтому bool сверяется отдельно: иначе
        # DisableDHT=1 прошло бы как «тип совпал».
        if isinstance(reference, bool) != isinstance(value, bool) or not isinstance(
            value, type(reference)
        ):
            raise SettingsError(
                f"{name}: тип значения {value!r} ({type(value).__name__}) не совпадает "
                f"с текущим ({type(reference).__name__})"
            )
        if reference != value:
            pending[name] = value
    return pending


def apply_changes(
    transport: SettingsTransport, changes: dict[str, Any]
) -> dict[str, tuple[Any, Any]]:
    """Записать поля и убедиться, что изменилось ровно запрошенное.

    Возвращает фактический diff (пустой, если менять было нечего). Любое расхождение —
    SettingsError: побочно тронутое поле, заклампленное значение, потерянный сосед.
    """
    before = transport.get()
    pending = _validate(before, changes)
    if not pending:
        return {}

    transport.set({**before, **pending})
    after = transport.get()
    actual = diff_settings(before, after)

    problems: list[str] = []
    for name, value in pending.items():
        written = after.get(name)
        if written != value:
            problems.append(
                f"{name}: отправлено {value!r}, записалось {written!r} — сервер заклампил "
                "или проигнорировал значение"
            )
    for name, (old, new) in actual.items():
        if name not in pending:
            problems.append(f"{name}: изменилось само, {old!r} → {new!r} (не просили)")
    if problems:
        raise SettingsError(
            "запись не подтвердилась постусловием, состояние сервера могло поехать:\n  "
            + "\n  ".join(problems)
        )
    return actual


def _adb(serial: str | None, *args: str) -> None:
    cmd = ["adb"]
    if serial:
        cmd += ["-s", serial]
    cmd += args
    subprocess.run(cmd, capture_output=True, text=True, check=False)


def verify_restart(
    transport: SettingsTransport, expected: dict[str, Any], serial: str | None
) -> None:
    """Перезапустить движок и проверить, что значения пришли с диска, а не из памяти.

    Без этого шага проверка ничего не стоит: TorrServer перезапускается сам очень часто,
    и правка, не попавшая в config.db, исчезает при ближайшем рестарте — так уже терялась
    настройка от 22.08 (см. docs/torrserver-tuning.md).
    """
    _adb(serial, "shell", f"su 0 am force-stop {_PACKAGE}")
    _adb(serial, "shell", f"su 0 am start -n {_ACTIVITY}")
    for _ in range(30):
        time.sleep(2)
        try:
            after = transport.get()
        except SettingsError:
            continue  # движок ещё не поднял HTTP — это ожидаемо первые секунды
        mismatched = {k: (v, after.get(k)) for k, v in expected.items() if after.get(k) != v}
        if mismatched:
            raise SettingsError(f"после перезапуска значения не совпали: {mismatched}")
        print("перезапуск пережит: " + ", ".join(f"{k}={v!r}" for k, v in expected.items()))
        return
    raise SettingsError("TorrServer не поднялся за 60 с после перезапуска — проверь вручную")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--port", type=int, default=18090, help="проброшенный порт (adb forward)")
    parser.add_argument("--serial", help="serial устройства для adb, если их несколько")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("get", help="напечатать текущие настройки")
    setter = sub.add_parser("set", help="изменить поля с проверкой постусловия")
    setter.add_argument("assignment", nargs="+", metavar="Поле=значение")
    setter.add_argument(
        "--verify-restart",
        action="store_true",
        help="после записи перезапустить движок и убедиться, что значения пришли с диска",
    )
    args = parser.parse_args(argv)

    transport = HttpTransport(args.port)
    try:
        if args.command == "get":
            print(json.dumps(transport.get(), ensure_ascii=False, indent=2))
            return 0

        current = transport.get()
        changes = dict(parse_assignment(current, item) for item in args.assignment)
        applied = apply_changes(transport, changes)
        if not applied:
            print("менять нечего: значения уже такие")
            return 0
        for name, (old, new) in applied.items():
            print(f"{name}: {old!r} → {new!r}")
        print(f"постусловие пройдено: изменилось ровно {len(applied)} поле(й)")
        if args.verify_restart:
            verify_restart(transport, changes, args.serial)
    except SettingsError as exc:
        print(f"ОШИБКА: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
