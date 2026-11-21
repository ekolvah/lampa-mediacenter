## 0. Delivery start

- [x] 0.1 `agent-process start_change now-watching-open-any-source --planner Claude --implementer Claude`
  (tracking issue 95), дальше работа в `.claude/worktrees/now-watching-open-any-source`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`.
  - `memo` получает необязательный аргумент `t`.
  - Поиск тайтла — опции `find`/`search` двойника `tmdb.get` (как в тестах новизны сериалов);
    отложенный ответ — `defer` и `c.late`.
  - Открытие карточки TMDB — `openSource(c, source, { method, id })` (design.md, Standard approach).
  - «opened tmdb card back in place», циклом по `['tmdb', 'cub']`: сборка 1 с `defer` у `find` —
    Главная отдана до ответа, фильм новый и первый, `t` в памяти `'movie/<id>'` после ответа
    (design.md, решение 2); открытие `{ method: 'tv', id }` — `f` не 0; сборка 2 (`nextHome`) — фильм
    всё ещё первый, `t` сохранён, нового `find`/`search` о фильме нет; открытие `{ method: 'movie', id }` — `f` 0;
    сборка 3 — фильм на месте.
  - «no tmdb title warns, kp open still works»: `search` без совпадения — предупреждение с
    названием, `t` нет, открытие `tmdb` метку не снимает, открытие `KP.full` снимает. Сбой `find` —
    предупреждение с названием.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Тайтл новой карточки (решения 1, 2)

- [x] 2.1 `titleKey`, `readSeen` и `editSeen` в разделе «Общее». `orderByNovelty` копирует запись
  целиком и возвращает `fresh`. `filterRows` после `save()` — `resolveTitle` для `fresh` без `t`,
  запись `t` через `editSeen` на каждый ответ. Название в предупреждении сбоя `find`
  (`cardName`). Комментарий к `SEEN_KEY` — поле `t`. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`. Коммит группы.

## 3. Снятие метки из любого источника (решение 3)

- [ ] 3.1 `markOpened(key)` через `editSeen` — в раздел «Общее». `KP.full` зовёт её с id карточки,
  обёртка `full` в `patchSourceCards` — с `titleKey(title)`; текст `console.error`
  `patchSourceCards` дополнен. Проверка: та же. Коммит группы.

## 4. Доки

- [ ] 4.1 `docs/lampa-config-review.md`, строка `kp-reactions-fix.js`: память ряда `{ f, s, l, t }`,
  поиск тайтла новых карточек после сборки, снятие метки открытием карточки `tmdb`/`cub`. Шапка
  `plugins/kp-reactions-fix.js`. Коммит.

## 5. Живая проверка

- [ ] 5.1 `tests/live/now-watching/new-first.js` забывает карточку не с первого места с непустым
  `imdb_id`, если такая есть, иначе вторую. `tests/live/now-watching/new-first-check.js` при
  `OPENED = false` открывает карточку не через `KP.full`, а через
  `Lampa.Api.sources.tmdb.full({ method, id }, …)` по её `t`: `t` ждётся `Live.waitFor` до 15 с
  (нет — `Live.check` с названием), затем `f === 0`. `tests/live/now-watching.sh` — только тексты
  `echo`. Открытие `KP.full` остаётся в unit-тесте «opened card back in place».
- [ ] 5.2 Снапшот пина и ключа по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha
  ветки, затем `bash tests/live/now-watching.sh` → OK. После него рестарт процесса и `screencap`
  Главной (CLAUDE.md, проверка после живых рестартов). Коммит скриптов.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит его правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change now-watching-open-any-source`, затем
  `gh pr create --title "fix: now-watching-open-any-source" --body-file <отчёт>` (issue #95 простой
  ссылкой), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`.
- [ ] 7.2 После merge — Migration Plan из design.md: пин на sha `main` со снапшотом, затем
  `bash tests/live/now-watching.sh` → OK.

## Scenario → test map

Тесты, кроме живых шагов, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| now-watching-new-releases | Новая карточка первой | «new card first», `tests/live/now-watching.sh`, шаг `new-first-check` |
| now-watching-new-releases | Две новые карточки | «newest appearance first» |
| now-watching-new-releases | Новые в одну сборку | «same build keeps collection order» |
| now-watching-new-releases | Пять дней прошли | «new card back after five days» |
| now-watching-new-releases | Открытая карточка | «opened card back in place» |
| now-watching-new-releases | Открыта карточка TMDB | «opened tmdb card back in place», `tests/live/now-watching.sh`, шаг `new-first-check` (открыта) |
| now-watching-new-releases | Другой тип с тем же id | «opened tmdb card back in place» |
| now-watching-new-releases | Тайтл TMDB не найден | «no tmdb title warns, kp open still works» |
| now-watching-new-releases | Полный список без подъёма | «full list keeps collection order» |
