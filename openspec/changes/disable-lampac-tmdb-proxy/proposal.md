## Why

Lampa на приставке не находит в TMDB «Вот это драма!» (KP_6530127, `tt33071426`, TMDB `1325734`),
хотя в самом TMDB фильм есть (#73). Из-за этого у KP-карточки нет TMDB-тайтла, реакций и видео TMDB.

**Воспроизведение** (приставка, `tools/cdp.py`, 2026-11-19): `Lampa.TMDB.api('find/…')` строит
`https://beta.l-vid.online/tmdb/api/3/find/…&account_email=…&uid=…&token=…`, а не адрес Lampa:
`Lampa.TMDB.api` и `Lampa.TMDB.image` переопределены модулем `tmdbproxy` бандла Lampac
(`beta.l-vid.online/on.js`, флажок `alcopac_plug_tmdbproxy=true`). Сырой ответ этого адреса:
`find/tt33071426` → `movie_results: []`, `movie/1325734` → `404`, `status_code: 34`.

**Причина** — серверный список блокировок прокси Lampac (`X-Lampac-Server: Alcopac-Main`), а не
фильтр Lampa и не устаревшая база. С компьютера, тот же публичный ключ Lampa:

| Запрос | `beta.l-vid.online/tmdb/api/3` | `api.themoviedb.org/3` |
|---|---|---|
| `movie/1325734` | `404` | `200`, фильм |
| `movie/550` | `200` | `200` |
| `find/tt33071426` | `movie_results: []` | `movie_results`: `1325734` |
| `search/movie?query=Drama&primary_release_year=2026` | `total_results: 26`, 19 результатов: `1756237, 1704153, …` | 26 и 20: `1325734, 1756237, 1704153, …` |

Поиск совпадает без одного `1325734`, `total_results` не пересчитан. В 357 позициях первых трёх
страниц шести подборок (`trending`, `popular`, `now_playing`, `upcoming`) прокси прячет ещё один
фильм — `1083381` «Закулисье реальности».

С приставки TMDB доступен и без прокси (`fetch` из WebView, `movie/1325734`): `apitmdb.cub.red` и
`api.themoviedb.org` → `200` за ~275 мс; постер — `200` с `imagetmdb.cub.red` и `image.tmdb.org`.

## What Changes

- На приставке выключается необязательный модуль `tmdbproxy` бандла Lampac
  (`alcopac_plug_tmdbproxy=false`). Lampa возвращается к своим адресам TMDB, токен и email аккаунта
  больше не уходят с каждым запросом TMDB. Остальные модули Lampac не трогаются.
- Новая живая проверка `tests/live/tmdb-access.sh`: TMDB идёт не через прокси Lampac, и
  `find/tt33071426` через Lampa отдаёт `1325734`.
- `docs/lampa-config-review.md` описывает новое состояние.

## Capabilities

### New Capabilities
- `tmdb-access`: Lampa на приставке получает ответы TMDB без чужой фильтрации.

### Modified Capabilities

## Impact

- Конфигурация приставки (не в репозитории): `alcopac_plug_tmdbproxy` в `Lampa.Storage`, снапшот
  по [docs/snapshots-convention.md](../../../docs/snapshots-convention.md).
- `tests/live/tmdb-access.sh` — новый.
- `tests/live/tmdb-access/tmdb-unfiltered.js` — новый шаг.
- `docs/lampa-config-review.md` — правка (отдельная группа задач).
- `tools/README.md` — правка: применять `Storage.set` через `reload`, не `force-stop` (найдено при
  применении: запись localStorage теряется).
- Затрагивает #72, см. design.md, риски.
