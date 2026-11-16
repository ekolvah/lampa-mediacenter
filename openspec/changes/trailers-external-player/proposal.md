## Why

С 2026-11-16 на приставке не играет ни один трейлер YouTube во встроенном плеере Lampa: ни кнопкой
«Трейлер» (#58), ни «Смотреть» → «Трейлеры». YouTube требует от анонимных клиентов с домашнего IP
подтвердить, что это не бот. Встроенный плеер этого не умеет. Трейлеры переведены в SmartTube: на
приставке он играет. Репозиторий отстал от устройства. Живой тест `kp-trailers.sh` проверяет только
встроенный плеер и при текущей настройке падает. Issue #61 описывает неверную причину («ролик закрыт
по региону»).

Наблюдения (2026-11-16, IP ПК и приставки один, `curl ifconfig.me` → один адрес):

- Мост YouTube в Lampa (`postMessage` от `yumata.github.io`) для «1+1» (`tTwFeGArcrs`) и для
  тестового ролика Google `M7lc1UVf-VE`, запущенного `Lampa.Player.play` мимо плагинов:
  `{"type":"error","data":{"error":150}}`. Lampa показывает это как
  `.player-video__youtube-noplayed` («видео недоступно»).
- `curl https://www.youtube.com/watch?v=M7lc1UVf-VE` с ПК: `"playabilityStatus":{"status":"LOGIN_REQUIRED",
  "reason":"Войдите в аккаунт, чтобы подтвердить, что вы не бот"`. То же для `tTwFeGArcrs`.
- yt-dlp 2026.10.26 на приставке, `--extractor-args youtube:player_client=<c>` для `web_embedded`,
  `web`, `tv`, `mweb`, `android_vr`: каждый раз `ERROR: ... Sign in to confirm you're not a bot`.
- oEmbed обоих роликов отвечает `200`, встраивание разрешено. Значит, 150 — не запрет владельца.
- Страница моста `yumata/lampa/youtube.html`: последний коммит `3e43b7f` 2026-03-06.
- WebView Lampa (`Network.getAllCookies` через DevTools): 9 куки, все от `lampa.mx` и
  `l-vid.online`, ни одной от youtube.com или google.com. Вход в аккаунт плееру в iframe не
  передать.
- После `player_launch_trailers` = `youtube` (снапшот `2026-11-16_trailers-smarttube`) «1+1» списком
  и «Зверь» кнопкой открывают `org.smarttube.stable/...PlaybackActivity`. `dumpsys media_session`
  показывает `state=3` (PLAYING), AudioTrack uid 10060 (SmartTube) `started`.
- Код Lampa (`app.min.js?v=1994239`, `Trailers.onCreate`): при
  `Storage.field('player_launch_trailers') == 'youtube' && a.youtube` вызывается
  `Android.openYoutube(a.id)`. `a.youtube` по умолчанию `true`. Пункт сервиса из
  `kp-reactions-fix.js` (`{site:'YouTube', key, ...}`) поле не задаёт, поэтому тоже уходит в
  SmartTube.

## What Changes

- Док: «Плеер для трейлеров» = YouTube (SmartTube) и почему не встроенный.
- Живой тест `kp-trailers` проверяет внешний путь: какой id Lampa отдала наружу и что SmartTube
  играет (design.md, решение 2).
- Issue #61 закрывается с комментарием о настоящей причине. Issue #62 закрывается как неактуальный:
  `playing.js` больше не ждёт мост 20 с.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. `kp-card-trailers` («Воспроизведение с пульта») уже требует плеер из настройки «Плеер для
трейлеров». Поведение продукта не меняется, поэтому `skip_specs: true`.

## Standard approach

- Lampa: штатная настройка «Плеер для трейлеров» (`player_launch_trailers`: `inner` | `youtube`) с
  вызовом `Android.openYoutube`. Видно в коде `app.min.js` выше. Свой обход не нужен.
- YouTube IFrame API, `onError`: `101`/`150` означают, что ролик нельзя проиграть во встроенном
  плеере — https://developers.google.com/youtube/iframe_api_reference#onError
- yt-dlp FAQ про «Sign in to confirm you're not a bot»: лечится только куками аккаунта —
  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
- Состояние приложения и воспроизведения на Android: `dumpsys activity` / `dumpsys media_session` —
  https://developer.android.com/tools/dumpsys

## Impact

- Изменён `docs/lampa-config-review.md`.
- Изменён `tests/live/kp-trailers.sh`.
- Изменён `tests/live/kp-trailers/playing.js`.
- Добавлен `tests/live/kp-trailers/preflight.js`.
- Изменён `tests/live/kp-trailers/open-card-no-imdb.js` (комментарий о `trailer-focus.js`).
- Удалён `tests/live/kp-trailers/trailer-focus.js`.
- Код плагинов и `tools/` не меняется.
- GitHub: закрыть #61 и #62 с комментариями (после мержа).
