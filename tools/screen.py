"""Текстовый снимок состояния экрана — замена screencap, когда вопрос не визуальный.

Использование:
    python screen.py android [--serial SERIAL]   — нативный UI приставки (uiautomator dump)
    python screen.py lampa                       — экран Lampa (DOM через cdp.py)

Вывод — несколько строк текста (фокус, заголовок/контроллер, видимые пункты), не
картинка. Зачем — docs/token-efficiency-analysis.md, раздел A2: скриншот живёт в
контексте до компакта, и его цена — не ~1.5K токенов, а 1.5K × число последующих
обращений, хотя вопрос почти всегда текстовый ("что выделено", "есть ли пункт в
списке"). Для действительно визуальных вопросов (HDR, цветность, артефакты рендера,
вёрстка) снимком остаётся screencap — см. правило в CLAUDE.md.

lampa-режим требует заранее adb forward tcp:9222 (см. tools/README.md, раздел cdp.py).
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

import cdp

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from ci_check import redact_secrets  # noqa: E402

_WHITESPACE = re.compile(r"\s+")

# Извлекает: имя активного контроллера навигации (тот же сигнал, что читает
# tools/ui.py для --expect), заголовок активности, элемент в фокусе (класс `.focus` —
# то, чем Lampa помечает выделенный пульт-навигацией элемент) и заголовки видимых
# карточек. Проверено вживую на реальном устройстве (2026-08-19), не угадано.
_LAMPA_JS = r"""
(function () {
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  var out = {};
  try { out.controller = Lampa.Controller.enabled().name; } catch (e) { out.controller = null; }
  try {
    var a = Lampa.Activity.active();
    out.title = a.title; out.component = a.component; out.source = a.source; out.page = a.page;
  } catch (e) { out.title = document.title; }
  var focEl = document.querySelector('.focus');
  out.focused = focEl ? (clean(focEl.textContent) || focEl.getAttribute('aria-label') || null) : null;
  var cards = document.querySelectorAll('.card');
  var visible = [];
  for (var i = 0; i < cards.length && visible.length < 12; i++) {
    var c = cards[i];
    var r = c.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
      var t = c.querySelector('.card__title');
      visible.push(clean(t ? t.textContent : c.textContent));
    }
  }
  out.cards = visible;
  out.card_count = cards.length;
  return out;
})()
"""


def _clean(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def dump_android(serial: str | None) -> str:
    """Снять uiautomator dump и сразу прочитать его — без отдельного adb pull."""
    cmd = ["adb"]
    if serial:
        cmd += ["-s", serial]
    cmd += ["shell", "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml"]
    # encoding="utf-8" явно: text=True без него берёт кодировку консоли Windows и
    # молча портит кириллицу в тексте UI — тот же класс бага, что уже решён в cdp.py.
    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False
    )
    if proc.returncode != 0:
        raise RuntimeError(f"uiautomator dump упал: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def format_android(xml_text: str) -> str:
    """Свернуть uiautomator dump в фокус + список видимого текста."""
    start = xml_text.find("<?xml")
    if start == -1:
        raise ValueError("в выводе uiautomator нет XML — устройство недоступно или вывод повреждён")
    root = ElementTree.fromstring(xml_text[start:])
    labels: list[str] = []
    focused = None
    for node in root.iter("node"):
        label = _clean(node.get("text", "")) or _clean(node.get("content-desc", ""))
        if not label:
            continue
        if node.get("focused") == "true":
            focused = label
        labels.append(label)
    lines = [
        "экран: android (uiautomator)",
        f"фокус: {focused or '(нет данных)'}",
        f"видимый текст ({len(labels)}): " + ", ".join(labels),
    ]
    return redact_secrets("\n".join(lines))


def dump_lampa() -> dict[str, Any]:
    res = cdp.evaluate(_LAMPA_JS)
    if "error" in res:
        raise RuntimeError(f"CDP: {res['error']}")
    result = res["result"]
    if result.get("exceptionDetails"):
        raise RuntimeError(f"JS-исключение: {result['exceptionDetails']}")
    value = result["result"].get("value")
    if not isinstance(value, dict):
        raise RuntimeError("Lampa не вернула ожидаемый объект — страница lampa.mx не готова")
    return value


def format_lampa(data: dict[str, Any]) -> str:
    """Свернуть DOM-выборку Lampa в контроллер + заголовок + фокус + видимые карточки."""
    cards = data.get("cards") or []
    total = data.get("card_count", len(cards))
    lines = [
        f"экран: lampa (controller={data.get('controller') or '?'})",
        f"заголовок: {data.get('title') or '?'}",
        f"фокус: {data.get('focused') or '(нет данных)'}",
        f"видимые карточки ({total} всего, показаны первые {len(cards)}): " + ", ".join(cards),
    ]
    return redact_secrets("\n".join(lines))


def main() -> None:
    cdp.setup_stdout_utf8()
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("mode", choices=["android", "lampa"])
    parser.add_argument(
        "--serial",
        help="adb -s SERIAL для android-режима; по умолчанию единственное подключённое устройство",
    )
    args = parser.parse_args()

    try:
        if args.mode == "android":
            print(format_android(dump_android(args.serial)))
        else:
            print(format_lampa(dump_lampa()))
    except (RuntimeError, ValueError) as exc:
        print(f"ОШИБКА: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
