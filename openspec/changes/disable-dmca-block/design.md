## Context

Как блокирует ядро и кто читает `window.lampa_settings.dcma`, описано в proposal.md, раздел **Why**.
Наблюдение на приставке (2026-11-23, `tools/cdp.py`):
`Object.getOwnPropertyDescriptor(window.lampa_settings, 'dcma')` →
`{configurable: true, writable: true, getter: false, isArray: true}`, объект не заморожен,
`disable_features.dmca` = `false`. Список ядро пишет асинхронно: `Network.silent(…/blocked)`, затем
`ServiceKinopoisk.ready(() => lampa_settings.dcma = ServiceKinopoisk.allow(dcma))`. Порядок этой
записи относительно загрузки плагина не гарантирован.

Плагин `plugins/kp-reactions-fix.js` уже подключён на приставке по sha через jsDelivr. Тесты:
`tests/js/kp-reactions-fix.test.js` запускает файл в vm-контексте, где `window` и есть контекст.

## Goals / Non-Goals

**Goals:** список DMCA не действует ни в карточке `tmdb`/`cub`, ни в поиске; сбой отключения
видно; регрессию ловит живая проверка.

**Non-Goals:** список ЛГБТ-блокировки (`lampa_settings.lgbt`, отдельная настройка ядра); KP-карточки
(`kp_source` список не читает); кнопка «Сменить источник на CUB» — без DMCA-ошибки она для этих
тайтлов не появляется, а при других ошибках карточки остаётся поведением ядра.

## Standard approach

- В самом ядре (`src/app.js`, https://github.com/yumata/lampa-source) по умолчанию
  `lampa_settings.dcma: false` и флаг `disable_features.dmca`.
- `levende/lampa-plugins/anti-dmca.js` (https://github.com/levende/lampa-plugins/blob/main/anti-dmca.js,
  правка от 2026-10-28) блокирует поле через
  `Object.defineProperty(lampa_settings, 'dcma', {get: () => false, set: () => {}})` и подменяет
  `Utils.dcma`. При «непригодном» ответе он перезапрашивает карточку через сервер Lampac
  (`SERVER_ORIGIN = 'https://beta.l-vid.online'`). Это запрещает `tmdb-access`: тот прокси вырезает
  тайтлы (#73). Кроме того, все его ошибки глушатся пустыми `catch`. Поэтому сам плагин не
  подключаем, берём из него только приём `defineProperty`.
- `Kirill9732/alpac_source/plugins/plugins/anti-dmca.js` пишет `lampa_settings.dcma = false`
  и переписывает поле снова, если оно стало другим. `nb557/plugins/free.js` и `lampac-nextgen`
  `lampainit.js` пишут `false` один раз.

## Decisions

### 1. Один приём: свойство `lampa_settings.dcma` всегда `false`

`Object.defineProperty(window.lampa_settings, 'dcma', { get: () => false, set: () => {}, configurable: true, enumerable: true })`.

- Покрывает все три точки чтения сразу: `Utils.dcma` (`false && …` → `false`), его вызовы в
  `tmdb.full`, `cub.full`, `full.onError`, и фильтры поиска (`Arrays.isArray(false)` → фильтра нет).
- Значение `false` выбрано потому, что это умолчание самого ядра (`src/app.js`, `dcma: false`):
  ядро в таком состоянии штатно работает. `[]` тоже прошёл бы проверки, но такого состояния
  у ядра не бывает.
- Сеттер, а не разовая запись, потому что ядро пишет список после сетевого ответа (Context).

Альтернативы:
- Подменить `Lampa.Utils.dcma`: поиск фильтрует по полю напрямую, так что понадобилась бы вторая
  правка. Отвергнуто.
- Разовая запись `lampa_settings.dcma = false` (`nb557/free.js`): проигрывает гонку с записью ядра.
  Отвергнуто.
- Опрос по таймеру (`Kirill9732`): окно, в котором блокировка действует, плюс таймер на всё время
  работы. Отвергнуто.
- Подключить готовый `levende/anti-dmca.js`: отвергнуто, см. «Standard approach».
- `disable_features.dmca = true`: ядро читает флаг до загрузки плагинов. Отвергнуто.

### 2. Место: `kp-reactions-fix.js`, первым шагом `startPlugin()`

Новый файл-плагин означал бы второй адрес в плагинах приставки, вторую строку в доке и второй sha
при обновлении ради нескольких строк. Предшественник — решение 1 change `separate-card-module`:
один файл, разделы по ответственности. В шапочном комментарии плагина появляется абзац «DMCA».
`startPlugin()` выполняется, как только есть `Lampa.Api`, до ожидания `kp_source`. Поэтому
отключение не зависит от того, загрузился ли KP.

### 3. Сбой отключения виден и не роняет остальной плагин

`defineProperty` в `try`. Проверка чтением после него не нужна: если переопределить нельзя
(объект заморожен, свойство не `configurable`), `defineProperty` сам бросает `TypeError`.
Нет `window.lampa_settings` или исключение — пишется
`console.error('kp-reactions-fix: DMCA block not disabled', reason)` и показывается
`Lampa.Noty.show('DMCA-блокировка не отключена: ' + reason)`, как у `recsFailed`. После этого
`startPlugin()` продолжает работу (§IV: деградация видна, а не скрыта).

Вызывать отключение до проверки `window.Lampa`, на верхнем уровне IIFE, не стали: сообщить о сбое
можно только через `Lampa.Noty`, а `startPlugin()` и так стартует сразу, как только есть
`Lampa.Api`.

### 4. Живая проверка в `tests/live/tmdb-access.sh`

Шаг `dmca-unblocked.js` после уже существующего `restart_lampa`:
1. Сам читает `/blocked` (`Lampa.Utils.protocol() + 'tmdb.' + Lampa.Manifest.cub_domain + '/blocked'`)
   и проверяет, что `{id: 234763, cat: 'tv'}` там всё ещё есть. Если CUB уберёт тайтл из списка,
   шаг упадёт с «фикстура устарела», а не пройдёт впустую. Если `Lampa.Manifest.cub_domain`
   в сборке нет, шаг тоже падает с названием недостающего.
2. Ждёт `window.lampa_settings.dcma === false` через `Live.waitFor`: сразу после рестарта
   плагин может ещё не стартовать.
3. Вызывает `tmdb.full({method: 'tv', id: 234763})` и `cub.full(…)` с теми же параметрами и
   ждёт от каждого карточку с именем, не дольше 10 с.

Ожидание загрузки Lampa и гонку «вызов против таймаута 10 с» сейчас держит
`tmdb-unfiltered.js`. Они переезжают в `tests/live/tmdb-access/lib.js`: `step()` из
`tests/live/lib.sh` подключает его сам, и шагам не нужно хранить по копии. Ожидание
alcopac/tmdbproxy относится только к `tmdb-unfiltered` и остаётся в нём.

Поиск живой шаг не вызывает: фильтр живёт в компоненте поиска (`results.js`), и проверка
потребовала бы вести его UI из скрипта. Фильтр читает то же поле, что проверяет п. 2. Выдачу поиска проверяют вручную в задаче 5.4
через `tools/screen.py lampa`.

## Risks / Trade-offs

- [Ядро начнёт читать список под другим именем или заменит объект `lampa_settings`] → в
  `tmdb.full` и `cub.full` это ловит п. 3 живой проверки, в `full.onError` тоже: заглушку
  рисует только упавший `full`. В поиске это ловит только ручная проверка 5.4. Живую проверку
  гонять перед обновлением sha плагина, как и сейчас (`docs/lampa-config-review.md`).
- [Отключается защита, которую ядро ввело по просьбе правообладателей] → это решение пользователя
  (#106). В доке оно записано как поведение плагина.

## Migration Plan

После мержа: снапшот по [docs/snapshots-convention.md](../../../docs/snapshots-convention.md),
подключение плагина переводится на sha мержа, затем `bash tests/live/tmdb-access.sh` (Lampa он
перезапускает сам).
Откат — вернуть прежний sha в списке плагинов.
