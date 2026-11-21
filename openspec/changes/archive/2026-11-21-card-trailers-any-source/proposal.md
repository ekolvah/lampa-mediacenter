## Why

Tracking issue 94. Русский трейлер и трейлер последнего сезона есть только у карточек источника KP.
Карточка TMDB (ряды «Рекомендуем посмотреть», история TMDB) показывает видео TMDB как есть: у
«Бегущий по лезвию: Чёрный лотос» первым идёт английский Official Trailer, и кнопка «Трейлер»
запускает его.

Воспроизведение — на приставке 2026-11-21, `tools/cdp.py`: открыта `full:tmdb:84553`, в ответе
`tmdb.full` 5 видео, все `en`; сервис трейлеров на тот же тайтл отдаёт `thLKi6ZeEDk` «Бегущий по
лезвию: Чёрный Лотос — Русский трейлер (Дубляж, 2021)». Ни русского ролика, ни запроса к сервису
у карточки нет.

Причина — возможность карточки сделана в адаптере одного источника: `enrich`, `trailers`,
`ruTrailer`, `seasonTrailer` зовутся только из обёртки `KP.full` (`plugins/kp-reactions-fix.js`),
а карточки `tmdb` и `cub` открываются через `full` своего источника (design.md, наблюдение 6) и
идут мимо неё.

## What Changes

- Модуль «Карточка» плагина `kp-reactions-fix.js` оборачивает `full` источников `tmdb` и `cub` —
  так же, как плагин уже оборачивает `KP.full`, — и добавляет трейлеры в данные карточки до
  отрисовки.
- Карточка `tmdb` и `cub` получает русский трейлер сервиса и трейлер последнего сезона по тем же
  правилам, что KP-карточка. Тайтл TMDB — её собственный id, без поиска; видео и реакции остаются от
  источника.
- Помощники названия и даты карточки понимают поля сериала TMDB (`name`, `original_name`,
  `first_air_date`). Обёртка `KP.full` не меняется.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `kp-card-trailers`: добавлено требование «Трейлеры карточки TMDB» — русский трейлер и трейлер
  последнего сезона для карточек источников `tmdb` и `cub`. Имя capability не меняется (design.md,
  решение 3).

## Impact

- Изменены:
  - `plugins/kp-reactions-fix.js` — обёртки `tmdb.full` и `cub.full`, помощники названия и даты;
  - `tests/js/kp-reactions-fix.test.js` — двойники `tmdb.full`/`cub.full`, `drop` по пути любой
    глубины, тесты карточки TMDB;
  - `openspec/specs/kp-card-trailers/spec.md` — Purpose: карточки `tmdb`/`cub` (design.md,
    решение 3);
  - `tests/live/kp-trailers/lib.js` — ответ карточки через `Lampa.Api.full`, общая проверка
    «первым — ролик сервиса»;
  - `tests/live/kp-trailers/open-card-no-imdb.js` — на общей проверке;
  - `tests/live/kp-trailers.sh` — шаг карточки TMDB;
  - `docs/lampa-config-review.md` — строка плагина `kp-reactions-fix.js`;
  - `docs/jacred-on-ugoos.md` — для чего плагину сервис трейлеров.
- Добавлены:
  - `tests/live/kp-trailers/open-card-tmdb.js`;
  - `openspec/changes/card-trailers-any-source/`.
- На приставке: новый пин `kp-reactions-fix.js` (design.md, Migration Plan).
