## Why

До трейлера из карточки сейчас четыре нажатия пультом: «Смотреть» → «Трейлеры» → выбрать ролик → OK
(issue #58). Нужна кнопка «Трейлер» рядом со «Смотреть», которая с одного нажатия запускает ролик
без списка.

Наблюдение 2026-11-16, Lampa 3.4.7 на приставке (`Lampa.Manifest.app_version`), исходник
`http://lampa.mx/app.min.js?v=1994234`, прочитан через `cdp.py`:

- В шаблоне `full-start-new` кнопки источников и `view--trailer` лежат в `div.hide.buttons--container`.
  «Смотреть» (`button--play`, `onWatch`) показывает их меню `Select.show`.
- Обработчик `view--trailer` на `hover:enter` всегда открывает `Select.show({title: 'YouTube - ' + …})`,
  даже если ролик в списке один. Список собирается так: все видео сортируются по `published_at` по
  убыванию, первыми идут видео на `Storage.field('tmdb_lang')` (на приставке `ru`), за разделителем
  «Ещё» — видео на `en`, видео на других языках в список не попадают. `onSelect`: при
  `Platform.is('android') && Storage.field('player_launch_trailers') == 'youtube'` вызывается
  `Android.openYoutube(id)`, иначе `Player.play(a); Player.playlist(playlist)`. Если `movie.adult`,
  видео нет или `lampa_settings.disable_features.trailers`, движок удаляет `.view--trailer`.
- Событие `Lampa.Listener.send('full', {type: 'complite', body, data, …})` уходит после сборки
  компонентов карточки. В `data.videos` к этому моменту лежит список, который собрал `kp-reactions-fix.js`.

Наблюдение 2026-11-16 на приставке, временный слушатель через `cdp.py`, без записи в `Lampa.Storage`:
на `full`/`complite` кнопка `div.full-start__button.selector` вставлена через
`row.find('.button--play').after(b)` в карточку «Зверь» (KP 5512124). Фокус после открытия стоит на
`button--play`, контроллер `full_start`. `adb shell input keyevent DPAD_RIGHT` перевёл фокус на новую
кнопку, `DPAD_CENTER` вызвал её `hover:enter`. В `data.videos` пришло
`ru:J2VS_OlUJtA` (ролик сервиса) и `en`-ролики TMDB.

Наблюдение 2026-11-16 на той же карточке через `cdp.py`: `Lampa.Select.show` временно подменён
перехватчиком, затем вызван `trigger('hover:enter')` у `.view--trailer`. Перехватчик вызван синхронно,
до возврата из `trigger`. В `items` пришли `ru:J2VS_OlUJtA`, пункт `separator: true` («Ещё»), затем
`en`-ролики. После `finally` в `Lampa.Select.show` снова стоит исходная `function show$j`. Вызов
`onSelect(items[0])` открыл встроенный плеер с `https://www.youtube.com/watch?v=J2VS_OlUJtA`: мост
YouTube есть, без `needclick` и `noplayed`, `.selectbox` на экране нет.

Наблюдение 2026-11-16, тот же исходник, прочитан через `cdp.py`:

- `.view--trailer` снимает `Trailers.onCreate`: при `adult`, без видео или с
  `disable_features.trailers` — `this.html.find('.view--trailer').remove()`. Карточка вызывает
  `_this.build(_this.rows.slice(0, _this.view))` («Создаем все компоненты») раньше, чем
  `Lampa.Listener.send('full', {… type: 'complite' …})`. Значит, к `complite` у карточки без
  трейлеров `.view--trailer` уже нет.
- В шаблоне `full-start-new` сама `.view--trailer` рисуется через
  `<svg><use xlink:href="#sprite-trailer">`. В DOM приставки `#sprite-trailer` — это `symbol` внутри `svg`.

## Standard approach

- Штатный приоритет кнопки в Lampa 3.4.7 (`full_btn_priority`, тот же исходник): долгое нажатие на
  пункт меню «Смотреть» клонирует его рядом со «Смотреть» (`onPriorityButton`, `button--priority`).
  Не подходит: клон «Трейлеров» вызывает тот же `hover:enter` и открывает тот же список. Это экономит
  одно нажатие из четырёх.
- Готовый плагин Lampa с кнопкой, которая сразу запускает трейлер: none found: веб-поиск 2026-11-16
  «Lampa плагин кнопка трейлер в карточке full-start__buttons сразу запуск трейлера» и
  «lampa plugin trailer button card "full-start-new__buttons" github» не нашёл ни одного плагина
  Lampa. Среди плагинов на приставке (`Lampa.Storage.get('plugins')`: `on.js`, `p.js`,
  `kp_source.js`, `kp-reactions-fix.js`, `torrent-quality-badge.js`) такой кнопки нет.
- Кнопка в строке карточки на событии `full`/`complite` — тот же путь, каким плагины Lampa добавляют
  свои кнопки (наблюдение выше, плюс кнопки `on.js` `lampac--button` и `shots-view-button` в
  `.buttons--container` той же карточки).

## What Changes

- В `plugins/kp-reactions-fix.js` появляется кнопка «Трейлер» сразу после «Смотреть». Одно нажатие
  запускает первый ролик списка «Трейлеры» тем же запуском, что выбор в этом списке, а сам список не
  показывается. Первым в списке стоит русский ролик TMDB, а если его там нет, ролик сервиса. Если
  русского нет нигде, первым идёт английский. Такой выбор пользователь подтвердил 2026-11-16.
- Кнопки нет, если в карточке нет «Трейлеров». Если список пуст, нажатие показывает его.
- «Смотреть» → «Трейлеры» остаётся как есть.

## Capabilities

### New Capabilities

### Modified Capabilities

- `kp-card-trailers`: новое требование «Кнопка «Трейлер»»: первый ролик списка «Трейлеры» запускается с
  одного нажатия из строки кнопок карточки.

## Impact

- Изменяются: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/kp-trailers.sh` (проход кнопкой для «Зверя»), `tests/live/kp-trailers/open-card-no-imdb.js`
  и `trailer-focus.js` (одна глобальная `__kpRuTrailer` вместо `__kpRuTrailerName`),
  `tests/live/kp-trailers/playing.js` (если `__kpRuTrailer` задан, играет его `key`),
  `tests/live/kp-trailers/lib.js` (`openCard()` сбрасывает `__kpRuTrailer`: `Activity.push` страницу не
  перезагружает; `open-card-no-imdb.js` задаёт его после `openCard`).
- Добавляется: `tests/live/kp-trailers/button-focus.js`.
- Доки (отдельным коммитом): `docs/lampa-config-review.md`, строка `kp-reactions-fix`: как
  открываются трейлеры.
- На приставке: выкладка плагина по design.md, Migration Plan.
- Запросы не добавляются: кнопка берёт список, который движок собирает из уже загруженного
  `data.videos`.
