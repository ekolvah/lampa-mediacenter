## Context

Наблюдения — proposal.md, Why. Сверх них:

- `Lampa.Android` — тот же объект, через который движок вызывает `Android.openYoutube`. В
  `app.min.js?v=1994239` есть `var Android = { ... }` и экспорт `Android: Android`.
- Нативная часть `top.rootu.lampa` 1.13.6 шлёт `VIEW` на `https://www.youtube.com/...`, на приставке
  его принимает SmartTube (`cmd package resolve-activity` → `org.smarttube.stable`). В logcat URL
  скрыт: `START u0 {act=android.intent.action.VIEW dat=https://www.youtube.com/... cmp=org.smarttube.stable/...SplashActivity}`.
- Видеослой SmartTube в `screencap` выходит чёрным.
- Наблюдения 2026-11-16, «Зверь» кнопкой:
  - `adb -s 192.168.10.5:5555 shell "exit 1"; echo $?` → `1`: код выхода скрипта на приставке
    доходит до `kp-trailers.sh`.
  - Пока SmartTube играет, `dumpsys activity recents` показывает у его задачи
    `intent={flg=0x10000000 cmp=org.smarttube.stable/...PlaybackActivity}`, без `dat=`. SplashActivity
    передаёт ролик внутри приложения, так что id в `dumpsys` не виден. Чужой интент с `dat=` (VLC)
    выводится целиком, значит, дело не в маскировке.
  - До BACK: `mResumedActivity` = `org.smarttube.stable/...PlaybackActivity`, в `media_session`
    `package=org.smarttube.stable`, `state=3`. Через 4 с после `input keyevent 4`:
    `mResumedActivity` = `top.rootu.lampa/.MainActivity`, а в блоке `uid=10060` строки `state=` нет.
    То, что BACK возвращает в Lampa и настройка переживает рестарт, записано также в `NOTES.md`
    снапшота `2026-11-16_trailers-smarttube`.
- Lampa в фоне, пока играет SmartTube: таймеры WebView могут стоять.

## Goals / Non-Goals

**Goals:** живой тест проверяет сетап, который реально стоит на приставке. Док описывает текущее
состояние.

**Non-Goals:** чинить встроенный плеер (мост `yumata`, вход в YouTube в WebView). Проверять, какой
ролик играет внутри SmartTube.

## Decisions

1. **Трейлеры через SmartTube, а не через починку встроенного плеера.**
   SmartTube уже стоит на приставке, вошёл в YouTube кодом активации TV и проверку проходит. Плагин
   `kp-reactions-fix.js` правок не требует (proposal.md, Why).
   Отвергнутые варианты:
   - Вход в аккаунт Google в WebView Lampa. Куки youtube.com в WebView нет совсем, так что вход до
     iframe не дойдёт. Google не пускает вход во встроенные WebView. Куки аккаунта протухают и
     требуют поддержки.
   - Ждать, пока YouTube снимет метку с IP. Срок не известен, и метка может вернуться.

2. **Как живой тест проверяет «трейлер играет».**
   - Шаг `preflight.js` выполняется один раз, сразу после `restart_lampa`. Если
     `player_launch_trailers` ≠ `youtube`, он падает с причиной (§IV), иначе дальше был бы таймаут.
     Ещё он ставит обёртку на `Lampa.Android.openYoutube`: та пишет id в `window.__kpOpenedYoutube` и
     зовёт оригинал. Обёртка живёт, пока не перезагрузится страница: `Activity.push` её не
     перезагружает.
   - Функция `trailer_plays` в `kp-trailers.sh` вызывается после каждого запуска трейлера. Она делает
     один вызов `adb_sh` со скриптом, который работает на самой приставке:
     1. Раз в секунду, до 20 с, ждёт, пока `mResumedActivity` окажется из `org.smarttube.stable`, а
        его блок в `dumpsys media_session` покажет `state=3`. Нужны оба условия: `state=3` без
        переднего плана не доказывает, что запуск дошёл до SmartTube, а передний план без `state=3`
        не доказывает, что ролик играет. После BACK сессия SmartTube теряет `state` (Context), так что
        `state=3` от прошлого запуска не остаётся.
     2. `input keyevent 4` (BACK).
     3. До 20 с ждёт `top.rootu.lampa` в `mResumedActivity`.
     Не дождался — `exit 1` с последним прочитанным состоянием. Потом идёт `step playing`, уже при
     Lampa на переднем плане. `playing.js` читает id и сразу обнуляет его, ничего не ждёт. Он
     проверяет, что id есть, а если задан `__kpRuTrailer` (у «Зверя»), что id равен его `key`.
     Обнуление нужно потому, что «Зверь» запускается дважды после одного `openCard`. Без него второй
     запуск прошёл бы на id от первого.
   - Шаг `trailer-focus.js` удаляется вместе с параметром `play_first_trailer`. Он проверял, что
     первым в списке стоит ролик сервиса. Теперь это доказывает равенство отданного id ключу ролика
     сервиса.

   Отвергнутые варианты:
   - Id из logcat: URL скрыт.
   - Id из `dumpsys activity`: у задачи SmartTube интент без `dat=` (Context).
   - screencap: видеослой чёрный.
   - Id из данных SmartTube: это приватные данные чужого приложения.
   - Опрос adb с ПК: на каждый опрос два запуска adb и десятки КБ `dumpsys` по Wi-Fi.

   **Что перестаёт доказываться.** Мост встроенного плеера больше не проверяется. На приставке он не
   используется и сейчас не работает (proposal.md, Why), и ловить его поломку на этом сетапе не
   нужно. После `Android.openYoutube` ничего не проверяется по
   id: тест доказывает, какой id Lampa отдала наружу, и что после этого SmartTube на переднем плане
   играет. Что он играет именно этот id, не доказывается: снаружи id не виден (Context). Ловца у
   этой потери нет. Её закрывает человек, который смотрит трейлер. Поэтому сценарии «Русский
   трейлер с пульта» и «Трейлер одним нажатием с пульта» в tasks.md (Scenario → test map) доказаны
   только до отданного id.

## Risks / Trade-offs

- [SmartTube обновится и сменит имя пакета, activity или формат `media_session`] → `trailer_plays`
  упадёт с последним прочитанным состоянием в сообщении.
- [YouTube распространит проверку на бота на поиск] → сервис трейлеров (yt-dlp, тот же IP) перестанет
  находить ролики, и `open-card-no-imdb` упадёт на пустом `video_id`. Причину искать в логе сервиса
  (`docs/jacred-on-ugoos.md`).

## Migration Plan

Настройка на приставке уже стоит (снапшот `2026-11-16_trailers-smarttube`). Откат:
`Lampa.Storage.set('player_launch_trailers', 'inner')` через `tools/cdp.py`, затем revert PR.
