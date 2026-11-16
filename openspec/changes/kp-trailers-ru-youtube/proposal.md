## Why

В KP-карточке трейлеры берутся из TMDB `videos` (change `kp-card-trailers`, поиск тайтла без
`imdb_id` — change `kp-trailers-by-title`, #47). Но у части тайтлов в TMDB есть только английский
трейлер, а русский лежит на YouTube и находится только поиском по YouTube (issue #48).

Наблюдение 2026-11-07 (proposal #47): у «Зверь» (TMDB 1185344) и «Цикл зверя» (TMDB 1290418)
`videos` только на `en`.

Наблюдение 2026-11-07, `uvx yt-dlp` 2026.10.26 с домашнего IP, без ключа:
`yt-dlp --flat-playlist "ytsearch8:Зверь 2026 трейлер на русском"` вернул, среди прочих,
`J2VS_OlUJtA «Зверь (2026)#трейлер в русской озвучке#The Beast»`,
`0DvoI_LhuPY «Зверь — Русский трейлер (Дубялж, 2026)»` и
`AavXORys858 «Цикл зверя — Русский трейлер (Дубляж, 2026)»`.

Наблюдение 2026-11-07: запрос kinozal_scraper (`youtube.py:122`, `"{title} {year} trailer"` по
русскому и оригинальному названию, по 5 результатов) через `yt-dlp ytsearch5:` и выбор
`HeuristicStrategy` из kinozal_scraper (HEAD 40cd99d), по ~1–2 с на фильм:

| Фильм | Выбор | confidence, reason |
|---|---|---|
| Зверь / The Beast 2026 | `J2VS_OlUJtA` «Зверь (2026)#трейлер в русской озвучке» | 0.3, ambiguous: 2 |
| Цикл зверя / The Cycle 2026 | `AavXORys858` «Цикл зверя — Русский трейлер (Дубляж, 2026)» | 0.3, ambiguous: 2 |
| Лес / Лес 2026 | `jvKU_iEBItk` «**Ведьмин лес** — Русский трейлер #2» | 0.9, ru language — **ошибка** |
| Темный рыцарь 2008 | `HF1_epZNoCg` «Темный рыцарь (2008) — русский трейлер» | 0.3, ambiguous: 4 |

Наблюдение 2026-11-07 на приставке, `cdp.py` в странице Lampa (`location.origin` = `http://lampa.mx`):
и `new Lampa.Reguest().silent('http://127.0.0.1:9117/api/v1.0/conf')`, и `fetch` того же адреса
получают ответ (JacRed, `{"apikey":true}`), `fetch` — статус 200. Значит, плагин может обратиться к
сервису на loopback приставки. Ответ JacRed при этом несёт `Access-Control-Allow-Origin`, и без
этого заголовка страница ответ не читает (наблюдение 2026-11-16, design.md, решение 2). Порт 9118 на приставке свободен: слушают 139, 445, 5555, 6466, 6467, 8090, 9117, 42100
(`/proc/net/tcp*`).

## Standard approach

- Плагины Lampa, которые ищут трейлер на YouTube по названию: none found — веб-поиск «Lampa плагин
  трейлеры YouTube поиск по названию» не дал ни одного плагина; движок Lampa показывает только TMDB
  `videos`.
- Invidious API `/api/v1/search` (https://docs.invidious.io/api/): в списке
  https://api.invidious.io/instances.json 2026-11-07 из 10 инстансов открытый API (`api: true`) у
  одного, `yt.chocolatemoo53.com`; он ответил. Не подходит: держится на одном чужом инстансе, и
  общей с kinozal_scraper реализации не даёт.
- Piped: тот же класс прокси-инстансов, что Invidious, с теми же блокировками YouTube
  (https://sumguy.com/invidious-piped-redlib-nitter-2026/); отдельно не проверялся.
- YouTube Data API v3 `search.list` (https://developers.google.com/youtube/v3/docs/search/list) —
  то, чем ищет kinozal_scraper. Для Lampa отклонён по решению пользователя 2026-11-07: ключ пришлось
  бы держать на приставке, лимит 100 вызовов в сутки, нужен кэш.
- `yt-dlp` `ytsearchN:` (https://github.com/yt-dlp/yt-dlp#extractor-arguments, поисковый
  префикс `ytsearch`) — поддерживаемый инструмент, ключа и квоты нет, работает с домашнего IP
  (см. выше). Выбран пользователем 2026-11-07.
- Выбор ролика — `HeuristicStrategy` из kinozal_scraper (эталонный набор 32 случая: 29 hit, 2 miss,
  1 wrong). По решению пользователя 2026-11-07 он вынесен в библиотеку `ekolvah/trailer-search`
  (тег `v0.1.0`, 2026-11-15) вместе с эталонным набором и `scripts/eval_trailers.py`; ею пользуется
  сервис на приставке, а затем и kinozal_scraper.

## What Changes

- Новый HTTP-сервис на приставке, в Debian-chroot рядом с JacRed: по названию и году отдаёт
  русский трейлер с YouTube или «не найден» и отличает это от «поиск не удался»
  (spec `trailer-search-service`). Ищет через библиотеку `trailer-search` (yt-dlp + `HeuristicStrategy`).
- `plugins/kp-reactions-fix.js`: когда у тайтла в TMDB нет видео на `ru`, плагин спрашивает сервис
  и ставит найденный ролик первым в «Трейлеры» (spec `kp-card-trailers`).
- Запуск JacRed и нового сервиса — одна обёртка над `start-stop-daemon` и один boot-хук для всех
  сервисов chroot вместо скриптов только для JacRed (design.md, решение 8).
- Вне scope (решение пользователя 2026-11-07): единое правило поиска тайтла в TMDB для плагина и
  `tmdb_trailer.py` — отдельный issue. Библиотека `trailer-search` уже выпущена (`v0.1.0`), переход
  на неё kinozal_scraper — ekolvah/kinozal_scraper#647 (design.md, «Зависимости»).

## Capabilities

### New Capabilities

- `trailer-search-service`: HTTP-сервис на приставке, который по названию и году отдаёт русский
  трейлер с YouTube, явно отличая «не найден» от «поиск не удался».

### Modified Capabilities

- `kp-card-trailers`: в KP-карточке есть русский трейлер с YouTube, когда в TMDB его нет. Меняется
  сценарий «Видео не пришли»: при пустых видео TMDB карточка всё равно получает трейлер, если его
  нашёл сервис.

## Impact

- Добавляются: `tools/trailer_service.py`, `tests/test_trailer_service.py`, `tests/test_chroot_start.py`,
  `tests/live/kp-trailers/trailer-focus.js`, `tools/chroot-start.sh`,
  `tools/chroot-boot.sh`, `tools/start.d/jacred.sh`, `tools/start.d/trailer-search.sh`,
  `tools/trailer-search.requirements.txt`.
- Изменяются: `plugins/kp-reactions-fix.js`, `tests/js/kp-reactions-fix.test.js`,
  `tests/live/kp-trailers/open-card-no-imdb.js` (из #47: первым идёт ролик сервиса на `ru`),
  `tests/live/kp-trailers.sh` (шаги пульта — функция с новым шагом `trailer-focus`, вызывается и
  для «Зверя»),
  `.pre-commit-config.yaml` (pip-audit по `tools/trailer-search.requirements.txt`: `trailer-search[ytdlp]`
  с тега `v0.1.0` и пин yt-dlp).
- Удаляются: `tools/jacred-start.sh`, `tools/jacred-boot.sh` (их заменяют `chroot-start.sh`,
  `chroot-boot.sh`).
- Доки (отдельным коммитом): `docs/jacred-on-ugoos.md` (сервис трейлеров в «Что развёрнуто»,
  новые скрипты и хук в «Запуск», «Скрипты», «Откат», обновление пина yt-dlp, ограничения),
  `tools/README.md` (раздел про скрипты приставки), описание дока в `CLAUDE.md`, строка
  `kp-reactions-fix` в `docs/lampa-config-review.md`.
- На приставке: venv `/opt/trailer-search` в chroot (`python3`, `python3-venv` из Debian 13),
  `/system/su.d/99chroot` вместо `99jacred`, `/data/debian/root/start.d/`. Снапшот перед правкой —
  по `docs/snapshots-convention.md`.
- Запросы: плюс один запрос к `127.0.0.1:9118` на открытие KP-карточки, у тайтла которой нет видео
  на `ru`. На промах кэша сервис делает 1–2 поиска на YouTube.
