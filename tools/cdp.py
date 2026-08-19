"""Выполнить JS в контексте страницы Lampa через WebView DevTools Protocol.

Использование:
    python cdp.py <файл-с-js>            (или JS из stdin)  — одно выражение
    python cdp.py --batch <файл|stdin>   — несколько именованных выражений за один заход

Формат batch-файла — секции с заголовком `--- имя`:

    --- plugins_before
    Lampa.Storage.get('plugins','[]').map(p => p.url)
    --- reload
    (location.reload(), 'ok')

Формат без экранирования: строка внутри самого JS-выражения, начинающаяся с '--- ',
будет ошибочно принята за заголовок следующей секции.

Требует заранее: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
"""

import argparse
import io
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

import websocket

# Длинный результат в одну строку читать нельзя, но тихая обрезка хуже отсутствия
# данных: маркер снизу делает её видимой аномалией, а не потерянным хвостом значения.
_TRUNCATE_LIMIT = 200

_BATCH_HEADER = re.compile(r"^---[ \t]+(\S.*?)\s*$", re.MULTILINE)


def page_target() -> str:
    targets = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json"))
    for t in targets:
        if t.get("type") == "page" and "lampa.mx" in t.get("url", ""):
            return str(t["webSocketDebuggerUrl"])
    raise SystemExit("страница lampa.mx не найдена среди DevTools-таргетов")


def open_connection() -> websocket.WebSocket:
    ws: websocket.WebSocket = websocket.create_connection(page_target(), timeout=20)
    return ws


def evaluate_on(ws: websocket.WebSocket, request_id: int, js: str) -> dict[str, Any]:
    ws.send(
        json.dumps(
            {
                "id": request_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": js,
                    "returnByValue": True,
                    "awaitPromise": True,
                },
            }
        )
    )
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == request_id:
            return dict(msg)


def evaluate(js: str) -> dict[str, Any]:
    ws = open_connection()
    try:
        return evaluate_on(ws, 1, js)
    finally:
        ws.close()


def parse_batch(text: str) -> list[tuple[str, str]]:
    """Разбить batch-текст на именованные выражения по заголовкам `--- имя`."""
    headers = list(_BATCH_HEADER.finditer(text))
    if not headers:
        raise ValueError("--batch: не найдено ни одного заголовка вида '--- имя'")
    pairs = []
    for i, header in enumerate(headers):
        name = header.group(1)
        start = header.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        js = text[start:end].strip()
        if not js:
            raise ValueError(f"--batch: выражение {name!r} пустое")
        pairs.append((name, js))
    return pairs


def format_value(value: Any) -> str:
    """Компактно отрендерить результат, длинный — обрезать с явным маркером."""
    rendered = json.dumps(value, ensure_ascii=False)
    if len(rendered) <= _TRUNCATE_LIMIT:
        return rendered
    cut = len(rendered) - _TRUNCATE_LIMIT
    return f"{rendered[:_TRUNCATE_LIMIT]}... [обрезано, ещё {cut} симв.]"


def run_batch(pairs: list[tuple[str, str]]) -> int:
    """Выполнить выражения по порядку на одном соединении; при ошибке — остановиться."""
    ws = open_connection()
    try:
        for i, (name, js) in enumerate(pairs, start=1):
            res = evaluate_on(ws, i, js)
            if "error" in res:
                print(f"CDP ERROR [{name}]:", json.dumps(res["error"], ensure_ascii=False))
                return 1
            result = res["result"]
            if result.get("exceptionDetails"):
                details = json.dumps(result["exceptionDetails"], ensure_ascii=False, indent=2)
                print(f"JS EXCEPTION [{name}]:", details)
                return 1
            print(f"{name}: {format_value(result['result'].get('value'))}")
        return 0
    finally:
        ws.close()


def main() -> None:
    # Только тут, не на уровне модуля: импорт cdp.py тестами не должен подменять
    # sys.stdout процесса — pytest сам управляет захватом вывода.
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "file", nargs="?", help="файл с JS (или batch-спецификацией); иначе — stdin"
    )
    parser.add_argument(
        "--batch", action="store_true", help="несколько именованных выражений за один заход"
    )
    args = parser.parse_args()
    text = Path(args.file).read_text(encoding="utf-8") if args.file else sys.stdin.read()

    if args.batch:
        try:
            pairs = parse_batch(text)
        except ValueError as exc:
            print(exc)
            sys.exit(1)
        sys.exit(run_batch(pairs))

    res = evaluate(text)
    if "error" in res:
        print("CDP ERROR:", json.dumps(res["error"], ensure_ascii=False))
        sys.exit(1)
    result = res["result"]
    if result.get("exceptionDetails"):
        print("JS EXCEPTION:", json.dumps(result["exceptionDetails"], ensure_ascii=False, indent=2))
        sys.exit(1)
    print(json.dumps(result["result"].get("value"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
