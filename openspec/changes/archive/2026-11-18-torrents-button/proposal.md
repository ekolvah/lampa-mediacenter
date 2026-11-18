## Why

До списка торрентов из карточки сейчас три нажатия пультом: «Смотреть» → «Торренты» → OK. Нужна
кнопка «Торренты» в строке кнопок карточки, которая с одного нажатия открывает список торрентов,
как это сделано для трейлеров (`kp-card-trailers`, «Кнопка «Трейлер»»). «Смотреть» при этом
уходит из строки в меню «…» («Ещё»), где уже стоят «Рекомендации» и «Интересные факты». Так решил
пользователь 2026-11-18.

Наблюдение 2026-11-18, Lampa 3.4.7 на приставке (`Lampa.Manifest.app_version`), исходник
`http://lampa.mx/app.min.js?v=1994469`:

- `Torrents.onCreate`: `.view--torrent` лежит в скрытом `div.hide.buttons--container`. Класс `hide`
  снимается и `selector` ставится, только если `Storage.field('parser_use')`. Её `hover:enter`
  делает `Activity.push({component: 'torrents', search: …, movie: card})`, то есть открывает список
  торрентов.
- `Options.onCreate`: `hover:enter` у `.button--options` («…») сначала шлёт
  `Lampa.Listener.send('full', {link: this, type: 'options', options})`, потом дописывает свои пункты
  («AI-ассистент», «Рекомендации», «Интересные факты») и вызывает `Select.show({title: 'Еще', items})`.
  Пункт с собственным `onSelect` вызывается после закрытия меню (`Select`: `hide$5()`, затем
  `element.onSelect`).
- `Buttons.onGroupButtons` срабатывает в `toggle` карточки, то есть при каждом возврате в неё. Он
  делает `play.toggleClass('hide', !btns.length)`, поэтому снятый через класс `hide` «Смотреть»
  движок покажет снова. Движок сам удаляет «Смотреть» из DOM при `lampa_settings.read_only`:
  `this.html.find('.button--play').remove()`. Остальной код кнопок (`onGroupButtons`, `onWatch`)
  работает с пустой выборкой `play`. `onWatch` вызывается через `emit('watch', {})` у карточки:
  так его зовёт и путь серий (`items[0].emit('watch', {season})`).
- `Controller.collectionFocus(target)`: если `target` не в DOM (`offsetParent === null`), фокус
  получает первый `.selector` карточки без класса `hide`.
- Событие `full`/`complite` уходит раньше `groupButtons` и `toggle`.

Наблюдение 2026-11-18 на приставке через `cdp.py`, карточка KP_958607, без записи в
`Lampa.Storage`:

- `.selector` карточки по порядку: `button--play` «Смотреть», `button--kp-trailer` «Трейлер»,
  `button--book`, `button--reaction`, `button--subscribe hide`, `button--options`, затем скрытые
  `view--torrent` «Торренты», `shots-view-button`, `lampac--button`, `view--trailer`. Значит, без
  «Смотреть» первым становится то, что плагин поставит на его место.
- Временный слушатель `full`/`options` дописал пункт с `onSelect: e.link.emit('watch', {})`; затем
  вызван `hover:enter` у `.button--options`. `e.link` — это `items[0]` карточки. Меню «Еще» вышло с
  пунктами `Смотреть (проба)`, «AI-ассистент», «Рекомендации», «Интересные факты». `hover:enter` по
  пункту открыл `Select` «Источник» с пунктами «Торренты», «Shots», «Alpac Онлайн», «Трейлеры»,
  «Добавить источник». Слушатель снят, меню закрыто, контроллер вернулся в `full_start`.

## Standard approach

- Штатный приоритет кнопки Lampa 3.4.7 (`full_btn_priority`, `Buttons.onPriorityButton`, тот же
  исходник). Долгое нажатие на «Торренты» в меню «Смотреть» сохраняет хэш `outerHTML` кнопки, и
  `onGroupButtons` при каждом показе карточки ставит её клон первым в строку. Отвергнут: design.md,
  решение 1.
- Скрыть «Смотреть» штатно: в настройках Lampa такого пункта нет. Единственный путь в движке —
  `lampa_settings.read_only`, но он выключает и другие функции. Готовый плагин: none found: поиск
  2026-11-18 «lampa плагин скрыть кнопку Смотреть button--play карточка» и
  «lampa plugin "full-start-new__buttons" torrents button» не нашёл ни одного плагина Lampa: в
  выдаче только расширения браузеров и userscript'ы для других сайтов. Среди плагинов приставки
  (`document.scripts`: `on.js`, `p.js`, `kp_source.js`, `kp-reactions-fix.js`,
  `torrent-quality-badge.js`, `modification.js`, `cub.best/plugin/*`) в видимую строку кнопок
  карточки KP_958607 ставит кнопку только наш плагин («Трейлер», наблюдение в Why).
- Пункт в меню «…» через событие `full`/`options` — это штатный путь движка для плагинов (наблюдение
  выше). Кнопка в строке на `full`/`complite` — тот же путь, что у кнопки «Трейлер».

## What Changes

- В `plugins/kp-reactions-fix.js` появляется кнопка «Торренты» первой в строке кнопок карточки, на
  месте «Смотреть». Нажатие на неё делает то же, что «Смотреть» → «Торренты»: открывает список
  торрентов. Если торренты в карточке выключены, кнопки нет.
- «Смотреть» убирается из строки кнопок карточки. В меню «…» первым пунктом стоит «Смотреть»: он
  открывает тот же список источников, что раньше открывала кнопка.

## Capabilities

### New Capabilities

- `card-buttons`: «Торренты» в строке кнопок карточки и «Смотреть» в меню «…».

### Modified Capabilities

- `kp-card-trailers`: «Кнопка «Трейлер»» — место в строке (после «Торренты», а без них первая) и
  сценарий с пульта; «Трейлер последнего сезона» — сценарий с пульта начинается с фокуса на
  «Торренты», а не на «Смотреть».

## Impact

- Изменяются: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/kp-trailers.sh` (у «Зверя» проход списком «Трейлеры» идёт через «…» → «Смотреть»;
  у «1+1» — «Торренты» и кнопка «Трейлер» вместо прохода списком), `tests/live/kp-trailers/lib.js`
  (`openCard` ждёт фокус на «Торренты», а не на «Смотреть»), `tests/live/kp-trailers/button-focus.js`
  (комментарий).
- Добавляется: `tests/live/kp-trailers/torrents-open.js` (открыт список торрентов этой карточки).
- Доки (отдельным коммитом): `docs/lampa-config-review.md` — строка `kp-reactions-fix` и абзац
  «Плеер для трейлеров», где упомянуто «Смотреть» → «Трейлеры».
- На приставке: выкладка плагина по design.md, Migration Plan.
- Запросов и настроек `Lampa.Storage` изменение не добавляет.
