# tools/

## `cdp.py` — выполнить JS в контексте Lampa через DevTools WebView

Lampa — это веб-приложение в WebView внутри APK `top.rootu.lampa`. Её настройки
(включая список плагинов) лежат в LocalStorage и синхронизируются с CUB-аккаунтом.
**Править LevelDB напрямую нельзя** — формат бинарный, а облако всё равно может
перетереть локальную правку. Правильный путь — дёрнуть родное API самой Lampa
(`Lampa.Storage.get/set`) в контексте живой страницы: это ровно тот же код, который
выполняется при правке через UI, поэтому синхронизация остаётся консистентной.

### Подготовка (один раз за сессию)

```bash
MSYS_NO_PATHCONV=1 adb -s <DEVICE_IP>:5555 shell "cat /proc/net/unix | grep devtools"
# -> @webview_devtools_remote_<pid>
MSYS_NO_PATHCONV=1 adb -s <DEVICE_IP>:5555 forward tcp:9222 localabstract:webview_devtools_remote_<pid>
curl -s http://127.0.0.1:9222/json     # проверить, что таргет lampa.mx виден
```

Требуется питон-пакет `websocket-client`.

### Использование

```bash
python tools/cdp.py script.js     # или JS из stdin
```

Скрипт выполняет содержимое как выражение и печатает результат JSON-ом.
Пример — прочитать список плагинов:

```js
(function(){ return Lampa.Storage.get('plugins','[]').map(function(p){ return p.url; }); })()
```

Пример — применить изменение и перезагрузить приложение:

```js
(function(){
  var after = Lampa.Storage.get('plugins','[]').filter(function(p){ return p.url !== 'https://gpbx.me/w'; });
  Lampa.Storage.set('plugins', after);
  return after.map(function(p){ return p.url; });
})()
```

```bash
echo "window.location.reload(); 'ok'" | python tools/cdp.py
```

### Осторожно

Это полноценное выполнение кода в приложении — те же правила, что для любой правки
конфигурации: сначала снапшот по конвенции конвенции снапшотов,
одно изменение за раз, проверка после каждого.
