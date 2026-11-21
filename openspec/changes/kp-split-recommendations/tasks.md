## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-split-recommendations --planner Claude --implementer Claude`
  (tracking issue 91), дальше работа в `.claude/worktrees/kp-split-recommendations`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`. Двойник `load()`:
  - `Storage.get`/`set` уже держат один объект на ключ; добавить опции `recsMovie`, `recsTv` —
    начальные `kp_recs_movie`, `kp_recs_tv` (по умолчанию ключей нет).
  - `Recomends` двойника — объект с `get` (как `get$4` ядра) и `page`; тесты читают замену через
    `Lampa.Recomends.get`/`page` после загрузки плагина. `drop` понимает `'Recomends.page'`.
  - `Lang.translate` возвращает ключ.
  - Запись ядра — `Storage.set('recomends_list', list)` двойника, который шлёт `change`.
  Старые тесты рядов идут через опцию `recs` (список ядра) и после засева списков типа остаются
  зелёными без правок порядка.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Списки типа (решение 1)

- [x] 2.1 `mergeRecs` и подписка на `change` `recomends_list` при установке патча, засев из текущего
  `recomends_list`, запись `kp_recs_movie`/`kp_recs_tv`, срез до 100. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`, тесты «recs lists keep movies when core writes
  series», «recs list capped at 100 per type», «recs repeated title moves to end», «recs lists seeded
  from core list», «recs lists merged on restart», «recs broken stored list warns» (проверка формы
ключа, как `readSeen`). Коммит группы.

## 3. get/page и проверка функций (решения 2, 3)

- [x] 3.1 Замена `Lampa.Recomends.get` (список типа, последние первыми, без просмотренного по
  `recKey` истории `tmdb`/`cub` и KP-множества) и `Lampa.Recomends.page`. Проверка: та же, тесты
  «recs get drops watched», «recs get keeps other type with watched id», «recs page slices list».
  У замены `get` метка `__kp_split = true`.
- [x] 3.2 `Recomends.page` в `recsMissing`. Проверка: та же, тест «missing recomends get fails
  visibly» с новым случаем «нет `page`»; старые тесты рядов зелёные. Коммит группы.

## 4. Доки

- [x] 4.1 `docs/lampa-config-review.md`: в строке `kp-reactions-fix.js` ряды рекомендаций берут
  тайтлы из отдельных списков фильмов и сериалов (`kp_recs_movie`, `kp_recs_tv`, по 100), «Ещё» —
  тот же список. Шапка `plugins/kp-reactions-fix.js`. Коммит.

## 5. Живая проверка

- [x] 5.1 `tests/live/kp-history-recs/main-recs.js`: проверка 3 из сценария «Списки на приставке»
  (`kp_recs_movie`/`kp_recs_tv` есть, не больше 100, тип совпадает, фильмов не меньше, чем в
  `recomends_list`, карточки ряда фильмов — из `kp_recs_movie`, `Lampa.Recomends.get.__kp_split`).
  Перед `onlyMore()` сериалов `Lampa.Recomends.page` оборачивается записью вызовов: нужен вызов с
  `media === 'tv'`, а `total_pages` ответа равен `Math.ceil(Lampa.Recomends.get('tv').length / 20)`;
  после — обёртка снимается.
- [ ] 5.2 Снапшот пина по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha ветки,
  `bash tests/live/main-recs.sh` → OK, затем `screencap` Главной (процесс уже перезапущен
  скриптом). Коммит скрипта.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит его правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change kp-split-recommendations`, `gh pr create --title "fix:
  kp-split-recommendations" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Scenario | Test |
| --- | --- |
| Сериалы не вытесняют фильмы | `recs lists keep movies when core writes series` |
| Не больше 100 в списке типа | `recs list capped at 100 per type` |
| Тайтл снова пришёл от ядра | `recs repeated title moves to end` |
| Первый запуск | `recs lists seeded from core list` |
| Перезапуск | `recs lists merged on restart` |
| Испорченный сохранённый список | `recs broken stored list warns` |
| Просмотренное не отдаётся | `recs get drops watched` |
| Тот же id у другого типа | `recs get keeps other type with watched id` |
| Страницы экрана рекомендаций | `recs page slices list` |
| Списки на приставке | `tests/live/main-recs.sh` (шаг `kp-history-recs/main-recs.js`, проверка 4) |
| Два ряда за «Сейчас смотрят» | `recs rows after now watching` |
| Ряд «Сейчас смотрят» без новинок | `recs rows keep place of hidden row` |
| Рядов «Сейчас смотрят» нет | `recs rows first without now watching` |
| Не больше 40 карточек | `recs row capped at 40, pages counted` |
| «Ещё» ряда сериалов | `recs tv more opens core screen` |
| Нет рекомендаций сериалов | `no tv recs warns` |
| Нет функции рекомендаций ядра | `missing recomends get fails visibly` |
