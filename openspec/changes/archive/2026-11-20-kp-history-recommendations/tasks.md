## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-history-recommendations --planner Claude --implementer Claude`
  (tracking issue 77), дальше работа в `.claude/worktrees/kp-history-recommendations`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`. Двойник `Storage` в `load()`
  расширить `get/set` с одним объектом на ключ (как в ядре) и `listener`; добавить
  `Favorite.get({type: 'history'})` и `window.appready`. Ответы TMDB по записям — существующие
  `opts.find`/`opts.search`, предупреждения — `assertWarned`/`warnedWith`. «Ядро перезаписывает
  очередь» тест моделирует так: держит ссылку на массив из `Storage.get` до вставки и после неё зовёт
  `Storage.set` с этой ссылкой.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Очередь сканирования (решения 1, 2, 4, 5)

- [x] 2.1 `waiter(done, ms)`: таймаут параметром, существующие вызовы передают `ROWS_TIMEOUT_MS`.
  Проверка: `node --test tests/js/kp-reactions-fix.test.js` (старые тесты рядов зелёные).
- [x] 2.2 Из `patch()` по готовности приложения, один раз: KP-записи истории по одной → копия с
  `type` → `resolveTitle`, под `waiter(…, RECS_TIMEOUT_MS)`. Затем `unshift` недостающих `{id, tv}` в
  массив `Storage.get('recomends_scan')`, `Storage.set` им же и итоговый `console.warn` о пропущенных.
  Проверка: та же.
- [x] 2.3 Проверка первого `change` `recomends_scan` после вставки и `console.warn` при подмене.
  Проверка: та же. Коммит группы.

## 3. Чистка списка (решение 3)

- [x] 3.1 `Set` `<id>:<тип>`, одна функция `splice` над `Storage.get('recomends_list')`. После поиска —
  `Storage.set`, если что-то убрано; на `Storage.listener` `change` с `e.name === 'recomends_list'` —
  только `splice`. Проверка: `node --test tests/js/kp-reactions-fix.test.js`. Коммит группы.

## 4. Доки

- [x] 4.1 `docs/lampa-config-review.md`: в строке `kp-reactions-fix.js` написать, что плагин пишет в
  `recomends_scan` и `recomends_list`. Обновить шапку `plugins/kp-reactions-fix.js`. Коммит.

## 5. Живая проверка

- [x] 5.1 `tests/live/kp-history-recs.sh` и `tests/live/kp-history-recs/scan.js` по образцу
  `tests/live/now-watching.sh`, ожидание через `Live.waitFor`. Шаги:
  1. после `restart_lampa` в начале `recomends_scan` есть TMDB id KP-тайтлов истории;
  2. в пределах 150 с видимого окна первая из них получает `scan: 1`, в `recomends_list` нет
     тайтлов KP-истории, а в консоли нет предупреждения о подмене очереди;
  3. после ещё одного `restart_lampa` вставленные записи на месте.
- [x] 5.2 Снапшот `recomends_scan`/`recomends_list` и пина по `docs/snapshots-convention.md`. Пин
  `kp-reactions-fix.js` на sha ветки, затем `bash tests/live/kp-history-recs.sh` → OK. После него
  `screencap` ряда «Рекомендуем посмотреть» на «Фильмах» (проверка после живых рестартов из
  CLAUDE.md). Коммит скрипта.

## 6. Verify

- [x] 6.1 `/simplify`, коммит его правок.
- [x] 6.2 `openspec validate --strict --all`.
- [x] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [x] 7.1 `agent-process archive_change kp-history-recommendations`, затем
  `gh pr create --title "feat: kp-history-recommendations" --body-file <отчёт>` (issue #77 простой
  ссылкой), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`.
- [ ] 7.2 После merge — Migration Plan из design.md: пин на sha `main` со снапшотом, затем
  `bash tests/live/kp-history-recs.sh` → OK.

## Scenario → test map

Все тесты, кроме живого шага, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| kp-history-recommendations | KP-фильм | «kp movie queued first» |
| kp-history-recommendations | KP-сериал | «kp series queued as tv» |
| kp-history-recommendations | Очередь ядра не тронута | «core queue kept, no duplicate» |
| kp-history-recommendations | Один раз, когда приложение готово | «queue filled once after app ready» |
| kp-history-recommendations | Ядро перезаписывает очередь | «queue insert survives core write» |
| kp-history-recommendations | Ядро подменило очередь | «replaced core queue warns» |
| kp-history-recommendations | Очередь на приставке | `tests/live/kp-history-recs.sh`, шаг `scan` |
| kp-history-recommendations | Просмотренный KP-фильм убран | «watched kp movie removed, order kept» |
| kp-history-recommendations | Тот же id у другого типа | «same id other type kept in list» |
| kp-history-recommendations | Рекомендация пришла позже | «list cleaned after core write» |
| kp-history-recommendations | Убирать нечего | «clean list not rewritten» |
| kp-history-recommendations | Тайтл не найден или TMDB не ответил | «unresolved and failed kp counted in warning» |
| kp-history-recommendations | Проход не успел | «pass deadline counts rest as unresolved» |
