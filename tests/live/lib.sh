# Общие помощники живых проверок; подключается через `source` из tests/live/*.sh.
# Вызывающий задаёт DIR — каталог JS-шагов своего сценария.

UGOOS=${UGOOS:-192.168.10.5:5555}
adb_sh() { MSYS_NO_PATHCONV=1 adb -s "$UGOOS" shell "$@"; }

# cdp.py выполняет вход как одно выражение: общий lib.js, lib.js сценария (если есть), шаг.
step() {
  local libs=(tests/live/lib.js)
  [ -f "$DIR/lib.js" ] && libs+=("$DIR/lib.js")
  cat "${libs[@]}" "$DIR/$1.js" | python tools/cdp.py
}

restart_lampa() {
  adb_sh "am force-stop top.rootu.lampa"
  adb_sh "monkey -p top.rootu.lampa -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
  sleep 15
  pid=$(adb_sh "pidof top.rootu.lampa" | tr -d '\r')
  MSYS_NO_PATHCONV=1 adb -s "$UGOOS" forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
}
