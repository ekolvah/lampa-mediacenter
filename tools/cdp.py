"""Выполнить JS в контексте страницы Lampa через WebView DevTools Protocol.

Использование: python cdp.py <файл-с-js>   (или JS из stdin)
Требует заранее: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
"""
import io
import json
import sys
import urllib.request

import websocket

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")


def page_target():
    targets = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json"))
    for t in targets:
        if t.get("type") == "page" and "lampa.mx" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("страница lampa.mx не найдена среди DevTools-таргетов")


def evaluate(js):
    ws = websocket.create_connection(page_target(), timeout=20)
    try:
        ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": js,
                "returnByValue": True,
                "awaitPromise": True,
            },
        }))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 1:
                return msg
    finally:
        ws.close()


if __name__ == "__main__":
    js = io.open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
    res = evaluate(js)
    if "error" in res:
        print("CDP ERROR:", json.dumps(res["error"], ensure_ascii=False))
        sys.exit(1)
    result = res["result"]
    if result.get("exceptionDetails"):
        print("JS EXCEPTION:", json.dumps(result["exceptionDetails"], ensure_ascii=False, indent=2))
        sys.exit(1)
    print(json.dumps(result["result"].get("value"), ensure_ascii=False, indent=2))
