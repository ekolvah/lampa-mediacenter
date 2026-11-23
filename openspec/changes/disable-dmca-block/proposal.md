## Why

Тайтлы из DMCA-списка CUB не открываются как карточки `tmdb`/`cub` и пропадают из поиска (#106).

**Воспроизведение** (приставка, 2026-11-23, `tools/cdp.py`, движок `lampa.mx/app.min.js?v=1994901`).
Из ряда «Рекомендуем посмотреть сериалы» на Главной KP открыто «Слово пацана. Кровь на асфальте».
Активность `{component: 'full', source: 'tmdb', method: 'tv', id: 234763}`, на экране
«Контент заблокирован… по просьбе правообладателя» и кнопка «Сменить источник на CUB».
`Lampa.Utils.dcma('tv', 234763)` вернул `{"id":234763,"cat":"tv","imdb":"tt28429213","kpid":5304403}`,
а `tmdb.full({method:'tv', id:234763})` и `cub.full(…)` ушли в `onerror` без запроса.
Сам TMDB тайтл отдаёт: `GET tv/234763` → 200. Сейчас в рекомендациях четыре таких тайтла:
«Слово пацана», «Содержанки», «Вампиры средней полосы», «Последний богатырь: Корень зла».

**Причина** (код движка, совпадает с `yumata/lampa-source`). Блокирует клиент, а не сервер.
Ядро кладёт ответ `tmdb.<cub_domain>/blocked` в `window.lampa_settings.dcma` (сейчас 185 записей
`{id, cat, kpid}`). Читается список в трёх местах:
- `Utils.dcma(media, id)`, то есть `lampa_settings.dcma && lampa_settings.dcma.find(…)`; его зовут
  `tmdb.full` и `cub.full` (`if (Utils.dcma(params.method, params.id)) return onerror();`) и
  `onError` компонента `full` (заглушка `dmca_title`);
- поиск (`src/interaction/search/results.js`, `this.dmca` и `this.build`), который фильтрует выдачу
  напрямую: `if (Arrays.isArray(window.lampa_settings.dcma)) results.filter(…)`.

Кнопка «Сменить источник на CUB» не помогает: у `cub.full` та же проверка. К тому же она делает
`Storage.set('source', 'cub')` и навсегда уводит каталог с KP.

Готовые плагины против DMCA есть, но не подходят. Почему и что взято у них, описано в design.md,
раздел «Standard approach».

## What Changes

- `plugins/kp-reactions-fix.js` при старте делает `lampa_settings.dcma` всегда равным `false`:
  чтение отдаёт `false`, запись игнорируется. Так открываются карточки `tmdb`/`cub` и выдача поиска
  не фильтруется.
- Если поле заблокировать не удалось, плагин сообщает об этом `console.error` и `Lampa.Noty`;
  блокировка тогда остаётся как в ядре.
- Живая проверка `tests/live/tmdb-access.sh` получает шаг: после перезапуска Lampa
  `tmdb.full` грузит `tv/234763`.
- Строка плагина в `docs/lampa-config-review.md` описывает новое поведение.

## Capabilities

### New Capabilities

### Modified Capabilities
- `tmdb-access`: добавляется требование «Без DMCA-блокировки клиента». Тайтл TMDB открывается
  карточкой и находится поиском, даже если он есть в списке `/blocked` CUB.

## Impact

- Изменены: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/tmdb-access.sh`, `tests/live/tmdb-access/tmdb-unfiltered.js` (ожидание Lampa и
  таймаут переходят в общий `lib.js`), `docs/lampa-config-review.md`.
- Добавлены: `tests/live/tmdb-access/dmca-unblocked.js`, `tests/live/tmdb-access/lib.js`.
- Удалённых файлов нет. Новых зависимостей и доменов нет.
- После мержа на приставке надо перевести подключение плагина на новый sha
  (`cdn.jsdelivr.net/gh/ekolvah/lampa-mediacenter@<sha>/…`), по конвенции снапшотов.
