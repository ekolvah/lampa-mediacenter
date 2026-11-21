## Context

В `plugins/kp-reactions-fix.js` на уровне файла лежат константы, `cleanTitle`/`normalizeTitle`/`titles`,
кнопки (`cardButton` … `onFull`) и `startPlugin`. Всё остальное внутри `patch()`. Код карточки в
`patch()` обращается к `cub` и `tmdb`, но не к `KP` и `orgFull`. Код источника KP берёт у карточки
`resolveTitle`, `lastSeason`, `releaseDate`, `cardName` (`lastEpisode`, `isNewRelease`,
`collectPages`, `historyRecs`).

## Goals / Non-Goals

**Goals:** видимая граница «Карточка | Источник KP» в одном файле, чтобы #94 переносил связку
`KP.full` (guard `movie`, `resolveTitle` → `enrich`) в модуль карточки, не вытаскивая код из
замыкания.

**Non-Goals:** любое изменение поведения; карточки TMDB и cub (#94); «новинка» для любого
источника (#95); трейлер KP-карточки без TMDB (#96); второй файл-плагин.

## Decisions

### 1. Порядок файла: общее → Карточка → Источник KP → старт

1. **Общее**: константы, `cleanTitle`/`normalizeTitle`/`titles`, `var cub, tmdb;`, помощники TMDB
   `cardName`, `releaseDate`, `searchByTitle`, `resolveTitle`, `lastSeason`.
2. **Карточка**: `enrich`, `trailers`, `time`, `newest`, `putFirst`, `seasonTrailer`, `ruTrailer`,
   затем кнопки `cardButton` … `onFull`.
3. **Источник KP**: `patch()` со всем остальным, включая `KP.full` и `markOpened`.
4. `startPlugin` без изменений.

Перенос блоками, без переименований; внутри функций меняется только `var cub/tmdb =` → `cub/tmdb =` в `patch()`. Над каждым модулем
комментарий-заголовок.

`cub`/`tmdb` присваивает `patch()` на прежнем месте, перед guard, который их читает. Их читает только код,
достижимый после успешного `patch()`, так что момент привязки не меняется. Привязку при старте
без KP (`startPlugin`) делает #94 вместе с новой точкой входа: здесь это изменило бы поведение на
пути ожидания KP.

`markOpened` остаётся в модуле KP: он пишет память рядов KP (`SEEN_KEY`). После #94 обёртка
`KP.full` останется ради него, удалять её нельзя.

Альтернатива — два файла-плагина (issue #93). Отклонена пользователем: помощники общие для обеих
частей, им понадобился бы глобальный объект, а порядок загрузки плагинов не гарантирован
(комментарий в `startPlugin`). На приставке появился бы второй пин.

### 2. Без нового теста

Поведение не меняется. `tests/js/kp-reactions-fix.test.js` грузит весь файл через `vm` и проходит
`KP.full`, `KP.main`, `KP.list`, историю и `onFull`. Ссылка на имя, оставшееся в замыкании,
проявится там как `ReferenceError`. Пути без юнит-тестов закрывает решение 3.

### 3. Перепин и живые проверки в этом change

Живой движок проверяют только `tests/live/`. Модуль карточки проверяет `kp-trailers.sh`, модуль
KP — `now-watching.sh` (ряды новинок через `resolveTitle`/`lastSeason`) и `main-recs.sh` (ряды
рекомендаций и проход KP-истории). `kp-history-recs.sh` не нужен: тот же проход истории есть в
`main-recs.sh`, а остальное в нём — тик ядра и localStorage, их рефакторинг не трогает. Каждый
скрипт сам перезапускает Lampa (`restart_lampa`, `tests/live/lib.sh`). После них один `screencap`
Главной (CLAUDE.md), как в `kp-split-recommendations`, задача 5.2.

Отложить перепин до #94 нельзя: регрессия рефакторинга смешалась бы там с изменением поведения.

## Risks / Trade-offs

- [Имя осталось в замыкании, а используется вне его] → `ReferenceError` в `node --test`, для
  путей без юнит-тестов — живые проверки решения 3.
- [`/simplify` после живых проверок меняет код и sha] → тогда перепин и повтор решения 3.

## Migration Plan

Откат: пин из снапшота (сейчас sha `a5fbdd2…`) по `docs/snapshots-convention.md`, в
репозитории — revert PR.
