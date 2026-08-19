#!/usr/bin/env python3
"""Снимок аудио-тракта Ugoos AM6: что реально уходит на HDMI прямо сейчас.

    py -3.12 scripts/audio_state.py                     # снимок в stdout
    py -3.12 scripts/audio_state.py --require-playing   # + проверка, что звук идёт

Нужен, чтобы «до» и «после» правки сравнивались diff-ом, а не пересказом. Ключевой
узел — `/sys/class/amhdmitx/amhdmitx0/config`: он один показывает состояние
HDMI-инфофрейма (`audio type`, число каналов), то есть что приставка отдаёт
телевизору. `dumpsys media.audio_flinger` для этого непригоден: passthrough идёт
отдельным DIRECT-выходом, а primary-тред остаётся PCM в любом случае;
`/sys/class/amhdmitx/amhdmitx0/aud_mode` на чтение отдаёт пустое.

Снимок имеет смысл только во время воспроизведения: в простое HDMI несёт дежурный
2ch L-PCM независимо от настроек. `--require-playing` превращает это из устного
условия в отказ (exit 2), иначе пустой снимок молча выдаст себя за результат.

Коды возврата: 0 — снимок снят, 1 — устройство недоступно или проба провалилась,
2 — звук на HDMI не идёт (только с `--require-playing`).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Импорт ради побочного эффекта: ci_check при импорте переводит stdout/stderr в utf-8.
# Без этого русские подписи проб роняют скрипт на cp1252-консоли Windows — и снимок,
# ради которого его звали, теряется целиком.
import ci_check  # noqa: E402,F401  (после правки sys.path; нужен побочный эффект)

DEFAULT_SERIAL = "192.168.10.5:5555"

# Порядок = порядок в отчёте: сначала то, что отдаётся телевизору, потом чем это
# задано на приставке, потом что телевизор вообще готов принять.
# Третий элемент — коды возврата, считающиеся нормой. У grep код 1 значит «совпадений
# нет» (валидный ответ: ключа в настройках ещё не появилось), а 2 — уже настоящая
# ошибка, поэтому «всё кроме нуля — провал» тут не годится.
_PROBES: tuple[tuple[str, str, tuple[int, ...]], ...] = (
    ("HDMI: что уходит на TV", "cat /sys/class/amhdmitx/amhdmitx0/config", (0,)),
    ("HDMI: число каналов", "cat /sys/class/amhdmitx/amhdmitx0/aud_ch", (0,)),
    (
        # Расшифровка 0/1/2 — соглашение Amlogic; на этой прошивке подтверждается
        # записью значения и снятием `config` (шаг 4 плана), а не документацией.
        "Режим цифрового выхода (0=PCM, 1=raw AC3/DTS, 2=+HBR TrueHD/MAT)",
        "cat /sys/class/audiodsp/digital_raw",
        (0,),
    ),
    ("Кодек, отданный в raw", "cat /sys/class/audiodsp/digital_codec", (0,)),
    ("audio_samesource", "cat /sys/class/audiodsp/audio_samesource", (0,)),
    ("Микширование системных звуков", "settings get global audio_mixing", (0,)),
    ("Платформа: raw-вывод запрещён?", "getprop ro.vendor.platform.disable.audiorawout", (0,)),
    (
        "EDID телевизора: какие форматы принимает",
        "cat /sys/class/amhdmitx/amhdmitx0/aud_cap",
        (0,),
    ),
    (
        # Точное имя ключа passthrough в VLC 3.7.1 заранее неизвестно (в strings APK
        # есть только `audio_digital_output_enabled|_disabled`), поэтому шаблон широкий:
        # он покажет любой ключ вывода/passthrough, который появится после переключения
        # тумблера. Отсутствие совпадений — тоже результат, а не сбой пробы.
        "VLC: настройки вывода и что играло последним",
        'grep -E \'name="(aout|[^"]*(digital|passthrough|resume_title)[^"]*)"\' '
        "/data/data/org.videolan.vlc/shared_prefs/org.videolan.vlc_preferences.xml",
        (0, 1),
    ),
    # Без `-m1`: grep, закрывающий поток раньше времени, оставляет в снимке мусор
    # «Failed to write while dumping service package: Broken pipe» и бинарные байты.
    ("VLC: версия", "dumpsys package org.videolan.vlc | grep versionName", (0,)),
)

# Число каналов на HDMI. Проверяется положительное совпадение, а не отсутствие нуля:
# если проба не отработала и строки нет вообще, это тоже «звук не подтверждён».
_HDMI_CHANNELS = re.compile(r"hdmi_channel\s*=\s*(\d+)\s*ch")

# Управляющие байты из dumpsys превращают снимок в бинарный файл: git и grep
# перестают показывать его как текст, то есть diff «до/после» читать нечем.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

_PROBE_FAILED = "!! проба провалилась"


def run_probe(serial: str, command: str, ok_codes: tuple[int, ...]) -> tuple[str, bool]:
    """Выполнить одну read-only команду на устройстве.

    Возвращает (вывод, успех). Ненулевой код за пределами ok_codes — это `No such
    file` или `Permission denied`, попавшие в отчёт под видом данных; такой ответ
    маркируется в тексте и роняет весь снимок, иначе сравнение before/after
    молча пойдёт по неполным данным.
    """
    result = subprocess.run(
        ["adb", "-s", serial, "shell", command],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )
    output = _CONTROL_CHARS.sub("", result.stdout + result.stderr).strip()
    if result.returncode not in ok_codes:
        return f"{_PROBE_FAILED} (код {result.returncode})\n{output}".strip(), False
    return output or "<нет вывода>", True


def collect(serial: str) -> tuple[str, bool]:
    """Собрать полный снимок; возвращает (текст, все ли пробы отработали)."""
    lines = [f"# Снимок аудио-тракта, устройство {serial}", ""]
    all_ok = True
    for label, command, ok_codes in _PROBES:
        output, ok = run_probe(serial, command, ok_codes)
        all_ok = all_ok and ok
        lines.append(f"## {label}")
        lines.append(f"$ {command}")
        lines.append(output)
        lines.append("")
    return "\n".join(lines), all_ok


def device_online(serial: str) -> bool:
    """Устройство в списке adb и отвечает на shell."""
    listing = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=30)
    return f"{serial}\tdevice" in listing.stdout


def audio_channels(snapshot: str) -> int | None:
    """Сколько каналов сейчас на HDMI; None — строки в снимке нет вообще."""
    match = _HDMI_CHANNELS.search(snapshot)
    return int(match.group(1)) if match else None


def main() -> int:
    """Точка входа; коды возврата описаны в docstring модуля."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", default=DEFAULT_SERIAL, help="adb serial приставки")
    parser.add_argument(
        "--require-playing",
        action="store_true",
        help="отказ, если на HDMI не идёт звук (снимок в простое ничего не измеряет)",
    )
    args = parser.parse_args()

    if not device_online(args.serial):
        print(f"устройство {args.serial} недоступно по adb — снимок не снят", file=sys.stderr)
        return 1

    snapshot, all_ok = collect(args.serial)
    print(snapshot)

    if not all_ok:
        print(f"снимок неполный: см. «{_PROBE_FAILED}» выше", file=sys.stderr)
        return 1

    if args.require_playing:
        channels = audio_channels(snapshot)
        if channels is None:
            print("число каналов HDMI не прочиталось — звук не подтверждён", file=sys.stderr)
            return 2
        if channels == 0:
            print(
                "на HDMI 0 каналов: ничего не играет, снимок для сравнения непригоден",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
