## Context

Как ядро применяет список Кинопоиска, описано в proposal.md, раздел **Why**. Наблюдения на приставке
(2026-11-23, `tools/cdp.py`, движок `lampa.mx/app.min.js?v=1994913`):

- `lampa_settings` с `disable_features: {dmca: false, lgbt: false, kinopoisk: false, …}` ядро создаёт
  на верхнем уровне `app.min.js` (`if (typeof window.lampa_settings == 'undefined') … Arrays.extend(
  window.lampa_settings, {…})`), то есть до загрузки плагинов.
- Порядок старта: `loadTask` → `Task.secondary(… Plugins.load(showApp))`; `showApp` зовёт `startApp`;
  `startApp` первой строкой ставит `window.app_time_launch = Date.now()`, затем синхронно зовёт
  `ServiceKinopoisk.init()`. Флаг читается только там, один раз (поиск `disable_features.kinopoisk`
  по `app.min.js` — одно вхождение).
- Плагин стартует при исполнении своего файла: `if (window.Lampa && window.Lampa.Api) startPlugin();`.

Значит, плагин, исполненный в `Plugins.load`, записывает флаг раньше, чем `init` его прочтёт. Если
плагин исполнился после `startApp` (ядро не дождалось его загрузки или его подключили в работающем
приложении), `window.app_time_launch` уже задан: список загружен, и запись флага ничего не меняет.

## Goals / Non-Goals

**Goals:** карточки тайтлов из списка Кинопоиска открываются обычными, с кнопками плагина; сбой
отключения видно; регрессию ловит живая проверка.

**Non-Goals:** DMCA-список (отключён в disable-dmca-block); остальные флаги `disable_features`.

## Standard approach

- Выключатель ядра `lampa_settings.disable_features.kinopoisk` с комментарием «Кнопка «Смотреть на
  Кинопоиске» для карточек из списка CUB» (`app.min.js?v=1994913`; источник —
  https://github.com/yumata/lampa-source, `src/components/full/start/buttons.js` — ветка
  `button--kinopoisk`). Плагин пользуется им, а не обходит `ServiceKinopoisk`: тот живёт в замыкании
  ядра, снаружи недоступен.
- Готовых плагинов нет: `gh search code "disable_features"` и `gh search code "button--kinopoisk"`
  (2026-11-23) нашли только сам `yumata/lampa-source` и плагины рейтинга Кинопоиска
  (`and7ey/lampa`, `Rusickk/lampa`), которые этот список не трогают.

## Decisions

1. **Флаг пишется первым шагом `startPlugin()`**, рядом с `disableDmca()`, простой записью. Читатель
   один и читает флаг один раз, при старте приложения, поэтому `defineProperty` с сеттером, как у
   DMCA, не нужен. Альтернатива — блокировать поле сеттером — отклонена: защищает от записи, которой
   нет.
2. **Сбой видно, по образцу `disableDmca`** (одна ветка `try`/`catch`): нет
   `lampa_settings.disable_features` или задан `window.app_time_launch` (приложение уже стартовало,
   список загружен) → `console.error('kp-reactions-fix: Kinopoisk list not disabled', reason)` и
   `Lampa.Noty.show('Кнопка «Смотреть на Кинопоиске» не отключена: ' + reason)`. При позднем старте флаг
   всё равно пишется до проверки: на текущий запуск он не влияет, вреда нет (§IV). Общий помощник для
   таких отчётов не выносится: это рефакторинг соседнего кода (§VII).
3. **Живая проверка — шаг `kinopoisk-card` в `tests/live/tmdb-access.sh`**, рядом с `dmca-unblocked`,
   на его помощниках `waitLampa` и `call` из `tests/live/tmdb-access/lib.js`. Шаг проверяет, что
   фикстура tv/105276 ещё в `<cub_domain>/api/kinopoisk/list` (иначе прошёл бы и без плагина),
   открывает карточку и ждёт кнопок `.button--kp-torrent` и `.button--kp-trailer`: они ставятся только по
   событию `full`, которого ядро для карточки из списка не шлёт. Трейлер не проигрывается: этот путь уже
   покрывает `kp-trailers.sh` (`open-card-tmdb`).

## Risks / Trade-offs

- Без списка ядро не убирает его тайтлы из DMCA-списка (`ServiceKinopoisk.allow`); это закрывает
  требование «Без DMCA-блокировки клиента», от которого новое зависит.
- Новая версия ядра может читать флаг иначе или позже. Регрессию ловит живая проверка, поздний старт —
  уведомление.

## Migration Plan

После мержа: снапшот по конвенции, затем перевести подключение плагина на sha мержа через `cdp.py`
(`Lampa.Storage` `plugins`), затем `bash tests/live/tmdb-access.sh` (сам перезапускает Lampa).
Откат — вернуть прежний sha в `plugins` и перезапустить Lampa.
