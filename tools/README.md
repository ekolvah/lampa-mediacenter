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
MSYS_NO_PATHCONV=1 adb -s 192.168.10.5:5555 shell "cat /proc/net/unix | grep devtools"
# -> @webview_devtools_remote_<pid>
MSYS_NO_PATHCONV=1 adb -s 192.168.10.5:5555 forward tcp:9222 localabstract:webview_devtools_remote_<pid>
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

### Batch-режим — несколько выражений за одно обращение

Типовой сценарий «прочитать → изменить → перечитать → перезагрузить» — это четыре
вызова `cdp.py`, то есть четыре отдельных обращения к модели с полным контекстом.
`--batch` выполняет именованные выражения по порядку на одном WebSocket-соединении
и печатает сводку `имя: результат` одной строкой на выражение:

```bash
python tools/cdp.py --batch <<'JS'
--- plugins_before
Lampa.Storage.get('plugins','[]').map(p => p.url)
--- remove
(function(){ var a = Lampa.Storage.get('plugins','[]').filter(p => p.url !== 'https://example/w'); Lampa.Storage.set('plugins', a); return a.length; })()
--- reload
(location.reload(), 'ok')
JS
```

Если выражение падает (JS-исключение или ошибка CDP), печатается, какое именно, —
дальнейшие выражения batch'а не выполняются, exit-code ненулевой. Длинный результат
обрезается с маркером `[обрезано, ещё N симв.]` вместо тихого усечения. Без `--batch`
поведение то же, что раньше, — одно выражение из файла или stdin.

Формат секций — без экранирования: строка самого JS-выражения, начинающаяся с
`--- `, будет ошибочно принята за начало следующей секции.

### Осторожно

Это полноценное выполнение кода в приложении — те же правила, что для любой правки
конфигурации: сначала снапшот по конвенции [../docs/snapshots-convention.md](../docs/snapshots-convention.md),
одно изменение за раз, проверка после каждого.
