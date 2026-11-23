## Why

В карточках тайтлов из списка Кинопоиска CUB нет кнопок «Торренты» и «Трейлер»: вместо «Смотреть»
стоит «Смотреть на Кинопоиске», которая уводит в приложение Кинопоиска. Смотреть такой тайтл
торрентом из карточки нельзя.

**Воспроизведение** (приставка, 2026-11-23, `tools/cdp.py`, движок `lampa.mx/app.min.js?v=1994913`).
Открыт сериал «Беспринципные», активность `{component: 'full', source: 'tmdb', method: 'tv', id: 105276}`.
Видимые кнопки: `button--play button--kinopoisk` «Смотреть на Кинопоиске», «Избранное», «Реакции»,
«Подписаться», «…». Кнопок плагина `button--kp-torrent` и `button--kp-trailer` нет. Слушатель
`Lampa.Listener.follow('full', …)` за 5 с не получил ни одного события. Для контрольной карточки
tv/124364 («Извне») он получил `start, build ×3, complite`, и кнопки плагина есть. Сам ролик есть:
`Lampa.Api.full` этой карточки отдаёт первым `yJiYA2KBh4Y` «Беспринципные (5 сезон) - Трейлер (2026)»
от сервиса трейлеров.

**Причина** (код движка `app.min.js?v=1994913`, совпадает с `yumata/lampa-source`).
`ServiceKinopoisk.init` при старте приложения грузит `<cub_domain>/api/kinopoisk/list`. Сейчас это
`https://cub.best/api/kinopoisk/list`: 85 записей `{id, cat, kpid, url}`, среди них
`{id: 105276, cat: 'tv', kpid: 1355059}`. Для карточки из списка (`ServiceKinopoisk.find(card)`) ядро:
- не шлёт плагинам события `full` (`start`, `build`, `complite`, `options`); в коде движка комментарий
  «Карточка смотрится только на Кинопоиске — события не отправляем, чтобы плагины не добавляли свои
  кнопки»;
- в `onGroupButtons` переименовывает «Смотреть» в «Смотреть на Кинопоиске» с `Android.openBrowser(url)`,
  а свои «Торренты» и «Трейлеры» оставляет в скрытом контейнере.

Ядро даёт для этого штатный выключатель: `init` начинается с
`if (window.lampa_settings.disable_features.kinopoisk || !available()) return done();`, то есть список не
грузится, и `find` для любой карточки отдаёт `null`. Сейчас флаг `false`.

## What Changes

- `plugins/kp-reactions-fix.js` при старте записывает `lampa_settings.disable_features.kinopoisk = true`.
  Карточки из списка Кинопоиска становятся обычными: события `full` приходят, кнопки плагина ставятся.
- Сбой отключения виден: `console.error` и `Lampa.Noty` (design.md, решение 2).
- Живая проверка `tests/live/tmdb-access.sh` получает шаг: карточка «Беспринципных» открывается с
  кнопками «Торренты» и «Трейлер».
- Строка плагина в `docs/lampa-config-review.md` описывает новое поведение.

## Capabilities

### New Capabilities

### Modified Capabilities
- `tmdb-access`: добавляется требование «Без списка «Смотреть на Кинопоиске»», рядом с «Без
  DMCA-блокировки клиента». Тайтл из списка `/api/kinopoisk/list` CUB открывается обычной карточкой
  с кнопками «Торренты» и «Трейлер».

## Impact

- Изменены: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/tmdb-access.sh`, `docs/lampa-config-review.md`.
- Добавлен: `tests/live/tmdb-access/kinopoisk-card.js`.
- Удалённых файлов нет. Новых зависимостей и доменов нет.
- После мержа на приставке надо перевести подключение плагина на новый sha
  (`cdn.jsdelivr.net/gh/ekolvah/lampa-mediacenter@<sha>/…`), по конвенции снапшотов.
