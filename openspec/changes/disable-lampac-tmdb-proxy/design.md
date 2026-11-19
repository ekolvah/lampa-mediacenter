## Context

TMDB-запросы Lampa на приставке идут через прокси Lampac, который вырезает отдельные тайтлы
(proposal.md, **Why**). Прокси ставит необязательный модуль `tmdbproxy` бандла Lampac. Весь модуль,
прочитанный на приставке (1525 байт), делает три вещи: пишет `proxy_tmdb=true`; заменяет
`Lampa.TMDB.api` и `Lampa.TMDB.image` на `beta.l-vid.online/tmdb/…` с `account_email`, `uid` и
`token` в URL; прячет в настройках TMDB пункты прокси. Загрузчик `on.js` грузит его только при
включённом флажке: в `window.alcopac_plugin_list` у него `o: 1`, `optionalEnabled(key)` читает
`Lampa.Storage.get('alcopac_plug_' + key)`.

## Goals / Non-Goals

**Goals:** ответы TMDB в Lampa без вырезанных тайтлов; регрессия видна в живой проверке.

**Non-Goals:** оспаривать список блокировок Lampac; менять остальные модули Lampac; менять
`proxy_tmdb` и прочие настройки TMDB самой Lampa (одна правка за раз); запасной трейлер без
TMDB-тайтла (#72).

## Standard approach

- Lampac сам предусматривает отключение: «Optional ones load only when the user enabled them in
  Settings → Аккаунт; the toggles are standard Lampa trigger params stored as `alcopac_plug_<key>`
  in Lampa.Storage» (https://beta.l-vid.online/on.js, комментарий к `LIST`).
- Без модуля адреса строит сама Lampa: `api()` в `src/core/tmdb/tmdb.js` даёт
  `api.themoviedb.org/3/` и добавляет прокси только при `proxy_tmdb` и непустом `tmdb_proxy_api`
  (https://github.com/yumata/lampa-source/blob/6f159a396f80409a46b2c84e998569c71feb894d/src/core/tmdb/tmdb.js,
  строки 21–35). На приставке `tmdb_proxy_api` и `tmdb_proxy_image` — `null`. Сборка на `lampa.mx`
  может отличаться, фактические адреса печатает шаг проверки (задача 2.2).
- Настройки Lampa из CLI меняются через `Lampa.Storage.set` и `tools/cdp.py`
  ([tools/README.md](../../../tools/README.md)).

## Decisions

### 1. Выключить модуль `tmdbproxy`, а не обходить его

`Lampa.Storage.set('alcopac_plug_tmdbproxy', false)` через `tools/cdp.py`, затем рестарт Lampa:
модуль уже подменил функции в памяти, а загрузчик читает флажок только при старте.

Альтернативы:
- Обход в своём плагине мимо `Lampa.TMDB.api` — отвергнуто: свой код, а каталог, карточки и поиск
  Lampa остаются отфильтрованными.
- Убрать `on.js` целиком — отвергнуто: на нём `online`, `account`, `sync`, закладки, таймкоды.
- Свой TMDB-прокси — отвергнуто: TMDB с приставки доступен напрямую.

### 2. Отдельная живая проверка `tests/live/tmdb-access.sh`

Проблема — #73: фильтр невидим (`total_results` не пересчитан, ошибок нет), а флажок может вернуть
обновление Lampac или синхронизация аккаунта. Стандарт для состояния приставки в этом репозитории —
живые проверки `tests/live/<сценарий>.sh` со шагами `<сценарий>/*.js`; pytest проверяет код, не
устройство. Отдельный скрипт по образцу `now-watching.sh` (рестарт, шаг, `OK:`), а не шаг в
`kp-trailers.sh`: тому нужны SmartTube, сервис трейлеров и четыре проигрывания, и его `preflight`
падает раньше. Шаг `tmdb-unfiltered.js` проверяет оба сценария `tmdb-access`: адреса не ведут на
`beta.l-vid.online` (какие именно штатные — печатает без токена, не проверяет: сборка Lampa решает
сама) и `find` за 10 с даёт `1325734`. Если Lampac уберёт `1325734` из списка, проверка
адресов останется.

## Risks / Trade-offs

- **TMDB заблокируют для приставки** → каталог и постеры не грузятся. Митигация — штатные
  настройки прокси TMDB Lampa, которые снова видны. Откат — флажок обратно.
- **Флажок вернётся сам** (обновление Lampac, синхронизация аккаунта) → фильтр молча вернётся.
  Ловит `tmdb-access.sh`, который `docs/lampa-config-review.md` велит гонять после правки `on.js`
  или настроек аккаунта Lampac и перед правкой плагина, ходящего в TMDB (задача 3.1). Возврат
  между такими прогонами остаётся незамеченным — принятый риск. Сигнал при старте Lampa
  (`console.error` и `Lampa.Noty` из `kp-reactions-fix.js`, если `Lampa.TMDB.api` ведёт на
  `beta.l-vid.online`) — отдельное решение со своим сценарием, в это изменение не входит.
- **Модуль нужен чему-то ещё** → по его коду зависимостей нет. Задача 2.3 прогоняет живые проверки
  плагина, ходящего в TMDB (`kp-trailers.sh`, `now-watching.sh`), и смотрит Главную глазами.
- **#72** (`openspec/changes/kp-trailer-without-tmdb-title`, не начат): его **Why** называет фильтр
  вне нашего контроля, а живой шаг «Вот это драма!» проверяет путь без TMDB-тайтла. После этого
  изменения у фильма тайтл будет. Пример #72 надо сменить до его реализации — в #72, не здесь.

## Migration Plan

Снапшот, правка и проверка — задачи группы 2.

**Откат:** `Lampa.Storage.set('alcopac_plug_tmdbproxy', true)` через `cdp.py`, рестарт Lampa.
