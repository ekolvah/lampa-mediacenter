"""Сценарная навигация по UI Lampa через ADB — за один вызов вместо пошаговых keyevent.

Использование:
    python ui.py --keys "DPAD_UP,DPAD_RIGHT x3,DPAD_LEFT,DPAD_CENTER" [--expect head] [--delay 350]
    python ui.py --to "Настройки > Расширения"

Грамматика `--keys`: имена через запятую, каждое — KEYCODE (префикс `KEYCODE_`
можно не писать) с опциональным повтором через пробел (`DPAD_DOWN x3`).

`--expect` сверяется точным совпадением с сигналом текущего состояния Lampa —
именем активного контроллера навигации (`Lampa.Controller.enabled().name`: "head",
"items_line", "settings", "extensions_line" и т.п.), прочитанным через tools/cdp.py.
Это не полноценный текстовый снимок экрана (см. issue #3, tools/screen.py) —
узкий сигнал только для проверки места назначения сценария.

Требует заранее: adb connect на приставку и adb forward tcp:9222 (см. tools/README.md).
"""

import argparse
import re
import subprocess
import sys
import time
from dataclasses import dataclass

import cdp

_KEY_TOKEN = re.compile(r"^(?P<name>[A-Za-z0-9_]+)(?:\s+[xX](?P<count>\d+))?$")

# Выше настоящих UI-списков на устройстве (самый длинный виденный — 18 пунктов
# настроек) на порядок: страховка от опечатки вида x30000 вместо x3, а не
# рабочий предел сценария.
_MAX_REPEAT = 50

# Код возврата: различаем "адб/устройство недоступно" (инфраструктура, не навигация)
# от "сценарий выполнен, но не туда попали" — оператору нужна разная реакция на каждый.
EXIT_OK = 0
EXIT_EXPECT_MISMATCH = 1
EXIT_EXECUTION_ERROR = 2


@dataclass(frozen=True)
class Route:
    keys: str
    expect: str


# Именованные маршруты снимаются вживую на реальном устройстве (не угадываются) и
# предполагают конкретную стартовую точку — см. docstring у каждого маршрута.
ROUTES: dict[str, Route] = {
    # Старт: главный экран каталога, фокус на карточке контента.
    # DPAD_UP уводит фокус в верхнюю панель на непредсказуемую по сессии иконку
    # (Lampa помнит последнюю использованную колонку) — поэтому дальше саттурируем
    # вправо до конца панели и уже от гарантированной позиции идём на 1 влево к
    # шестерёнке настроек. Тот же приём внутри списка настроек: сначала саттурация
    # вниз до конца (сколько бы там ни было открыто до этого), потом фиксированные
    # 10 нажатий вверх до пункта «Расширения» (проверено вживую 2026-08-19).
    "Настройки > Расширения": Route(
        keys=("DPAD_UP,DPAD_RIGHT x3,DPAD_LEFT,DPAD_CENTER,DPAD_DOWN x20,DPAD_UP x10,DPAD_CENTER"),
        expect="extensions_line",
    ),
}


def parse_keys(spec: str) -> list[tuple[str, int]]:
    """Разобрать сценарий в список (KEYCODE, число повторов)."""
    if not spec.strip():
        raise ValueError("--keys: пустой сценарий")
    result = []
    for raw in spec.split(","):
        token = raw.strip()
        if not token:
            raise ValueError(f"--keys: пустой токен в {spec!r}")
        m = _KEY_TOKEN.match(token)
        if not m:
            raise ValueError(f"--keys: не распознан токен {token!r}")
        count = int(m.group("count")) if m.group("count") else 1
        if count < 1:
            raise ValueError(f"--keys: неверный повтор в {token!r}")
        if count > _MAX_REPEAT:
            raise ValueError(
                f"--keys: повтор {count} в {token!r} больше {_MAX_REPEAT} — похоже на опечатку"
            )
        name = m.group("name")
        keycode = name if name.startswith("KEYCODE_") else f"KEYCODE_{name}"
        result.append((keycode, count))
    return result


def resolve_route(name: str) -> Route:
    try:
        return ROUTES[name]
    except KeyError:
        known = ", ".join(sorted(ROUTES)) or "(нет ни одного)"
        raise ValueError(f"--to: неизвестный маршрут {name!r}. Известные: {known}") from None


def send_keyevent(serial: str | None, keycode: str) -> None:
    cmd = ["adb"]
    if serial:
        cmd += ["-s", serial]
    cmd += ["shell", "input", "keyevent", keycode]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"adb keyevent {keycode} упал: {proc.stderr.strip() or proc.stdout.strip()}"
        )


def run_keys(serial: str | None, steps: list[tuple[str, int]], delay_ms: int) -> None:
    """Выполнить сценарий по шагам; при сбое сообщить, на каком именно шаге."""
    delay_s = delay_ms / 1000
    step_no = 0
    for keycode, count in steps:
        for _ in range(count):
            step_no += 1
            try:
                send_keyevent(serial, keycode)
            except RuntimeError as exc:
                raise RuntimeError(
                    f"сценарий остановлен на шаге {step_no} ({keycode}): {exc}"
                ) from exc
            time.sleep(delay_s)


def read_state() -> str:
    """Прочитать сигнал текущего состояния Lampa через cdp.py.

    Отдельно от несовпадения --expect: если DevTools-порт не проброшен или Lampa
    не поднята, здесь падает своя, отличимая от "не туда попали" ошибка.
    """
    res = cdp.evaluate("Lampa.Controller.enabled().name")
    if "error" in res:
        raise RuntimeError(f"не удалось прочитать состояние Lampa (CDP): {res['error']}")
    result = res["result"]
    if result.get("exceptionDetails"):
        raise RuntimeError(
            f"не удалось прочитать состояние Lampa (JS): {result['exceptionDetails']}"
        )
    return str(result["result"].get("value"))


def main() -> None:
    cdp.setup_stdout_utf8()
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--keys", help="сценарий нажатий, см. грамматику в описании")
    group.add_argument("--to", help="именованный маршрут из ROUTES")
    parser.add_argument("--expect", help="ожидаемое состояние после сценария (точное совпадение)")
    parser.add_argument(
        "--delay", type=int, default=350, help="пауза между нажатиями, мс (по умолчанию 350)"
    )
    parser.add_argument(
        "--serial", help="adb -s SERIAL; по умолчанию единственное подключённое устройство"
    )
    args = parser.parse_args()

    try:
        if args.to:
            route = resolve_route(args.to)
            steps = parse_keys(route.keys)
            expect = args.expect if args.expect is not None else route.expect
        else:
            steps = parse_keys(args.keys)
            expect = args.expect
    except ValueError as exc:
        print(exc)
        sys.exit(EXIT_EXECUTION_ERROR)

    try:
        run_keys(args.serial, steps, args.delay)
    except RuntimeError as exc:
        print(f"ОШИБКА ВЫПОЛНЕНИЯ: {exc}")
        sys.exit(EXIT_EXECUTION_ERROR)

    if expect is None:
        print("сценарий выполнен (--expect не задан, состояние не проверялось)")
        sys.exit(EXIT_OK)

    try:
        state = read_state()
    except RuntimeError as exc:
        print(f"НЕ УДАЛОСЬ ПРОВЕРИТЬ СОСТОЯНИЕ: {exc}")
        sys.exit(EXIT_EXECUTION_ERROR)

    if expect != state:
        print(f"НЕ ТО МЕСТО: ожидали {expect!r}, оказались в {state!r}")
        sys.exit(EXIT_EXPECT_MISMATCH)

    print(f"OK: {state!r}")
    sys.exit(EXIT_OK)


if __name__ == "__main__":
    main()
