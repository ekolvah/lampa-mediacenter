## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-main-recommendations --planner Claude --implementer Claude`
  (tracking issue 81), дальше работа в `.claude/worktrees/kp-main-recommendations`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`. Фикстуры — существующие
  `home()`, `row()`, `names()` с опциями `recs()` (`appready`, `history`, `find`, `defer`). Двойник в
  `load()` расширить:
  - `Recomends.get(type)` повторяет `get$4` ядра над `Storage.get('recomends_list')` из опции
    `recs`: фильтр по типу (`number_of_seasons || first_air_date`), `reverse`, без `id` из истории.
    Так чистка списка проходом видна рядам. Опция `drop` — список того, что убрать из двойника: `'Recomends'`, `'Recomends.get'`,
    `'Router'`, `'Arrays'`.
  - `Router.call` пишет вызовы в `calls`.
  - `Arrays.shuffle` возвращает копию без перестановки.

  - `home()` по умолчанию берёт законченный проход (`appready: true`, пустая история). Тогда старые
    тесты Главной не ждут `fire()` и не получают « · неполный». Их сравнения всей порции поправить
    на рекомендации: по умолчанию `recs: []`, рядов нет, есть два `no recommendations`.
  - `calls.fireMs(ms)` запускает только таймеры с этим `ms`. Тест срока зовёт `fireMs(5000)`: общий
    `fire()` первым запустил бы таймер прохода на 60000 мс и закончил бы проход.

  Конец прохода задаёт существующий `defer` (`calls.late`). Предупреждения проверяются через
  `assertWarned`/`warnedWith`.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Ряды (решения 1, 2, 4)

- [ ] 2.1 Сборка ряда типа из одного `Lampa.Recomends.get(type)` (решение 1). Пустой тип даёт
  `null` и `console.warn('kp-reactions-fix: no recommendations', type)`. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`, тесты «recs row capped at 40, pages counted»,
  «recs tv more opens core screen», «no tv recs warns».
- [ ] 2.2 Проверка `Recomends.get`, `Router.call`, `Arrays.shuffle` при установке обёртки без
  исключения при отсутствии объекта и `recsFailed(reason)` (решение 4). Проверка: та же, тест
  «missing recomends get fails visibly» — случаи «нет `Lampa.Recomends`», «нет `get`» и «нет
  `Router` и `Arrays`». Во всех случаях ряды новинок на месте, а в причине `Noty`/`console.error`
  названы недостающие функции. Коммит группы.

## 3. Первая порция (решения 2, 3)

- [ ] 3.1 Признак конца прохода в `historyRecs`: `historyDone` и список колбэков, очищаемый после
  вызова. Ставится в `done` его `waiter` и сразу без KP-истории. Проверка: та же, тест «two mains
  wait for one pass» и старые тесты прохода зелёные.
- [ ] 3.2 `filterRows(parts, pending)` возвращает `build()`, ветка без рядов `NOW_WATCHING` — тоже.
  Обёртка `KP.main` заводит один `waiter`, слот прохода — его `pending()`. `done` ставит ряды
  рекомендаций по решению 2, без признака — « · неполный» (общая константа с `filteredRow`) и
  `console.warn`. Проверка: та же, тесты «recs rows after now watching», «recs rows keep place of
  hidden row», «recs rows first without now watching», «main waits for history pass», «main not
  delayed after pass», «recs incomplete after deadline». Старые тесты новинок тоже зелёные. Коммит
  группы.

## 4. Доки

- [ ] 4.1 `docs/lampa-config-review.md`: в строку `kp-reactions-fix.js` добавить ряды рекомендаций
  на Главной KP. Обновить шапку `plugins/kp-reactions-fix.js`. Коммит.

## 5. Живая проверка

- [ ] 5.1 `tests/live/main-recs.sh` с `DIR=tests/live/kp-history-recs` и шагом
  `tests/live/kp-history-recs/main-recs.js`. Шаг берёт `isTv`/`recKey`/`kpKeys` из его `lib.js`, а
  ряды Главной — как `lines()` в `tests/live/now-watching/rows.js`. Скрипт делает `restart_lampa`,
  потом шаг. Шаг ждёт рядов через `Live.waitFor` и проверяет:
  1. сразу за последним рядом «Сейчас смотрят» стоят «Рекомендуем посмотреть фильмы» и
     «Рекомендуем посмотреть сериалы», у обоих есть «Ещё» (`MORE`);
  2. у всех карточек рядов `source === 'tmdb'`, ни одна не совпадает по `id` с записями истории
     `tmdb`/`cub` и по `recKey` с `kpKeys()`;
  3. `line.data.params.emit.onlyMore()` у ряда сериалов открывает `component === 'recomend'` с
     `media === 'tv'`, затем `Lampa.Activity.backward()`.

  Если у рядов « · неполный», шаг отвечает `wait:`. Это холодный кэш движка (Risks в design.md):
  скрипт делает ещё один `restart_lampa` и повторяет шаг. Второй `wait:` — FAIL.
- [ ] 5.2 Снапшот пина по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha ветки,
  затем `bash tests/live/main-recs.sh` → OK. После него `screencap` Главной: процесс уже
  перезапущен скриптом. Коммит скрипта.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит его правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change kp-main-recommendations`, затем
  `gh pr create --title "feat: kp-main-recommendations" --body-file <отчёт>` (issue #81 простой
  ссылкой), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`.
- [ ] 7.2 После merge — Migration Plan из design.md, затем `bash tests/live/main-recs.sh` → OK.

## Scenario → test map

Все тесты, кроме живого шага, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| kp-main-recommendations | Два ряда за «Сейчас смотрят» | «recs rows after now watching» |
| kp-main-recommendations | Ряд «Сейчас смотрят» без новинок | «recs rows keep place of hidden row» |
| kp-main-recommendations | Рядов «Сейчас смотрят» нет | «recs rows first without now watching» |
| kp-main-recommendations | Не больше 40 карточек | «recs row capped at 40, pages counted» |
| kp-main-recommendations | «Ещё» ряда сериалов | «recs tv more opens core screen» |
| kp-main-recommendations | Проход закончился после прихода порции | «main waits for history pass», «two mains wait for one pass» |
| kp-main-recommendations | Проход уже закончился | «main not delayed after pass» |
| kp-main-recommendations | Проход не успел | «recs incomplete after deadline» |
| kp-main-recommendations | Ряды на приставке | `tests/live/main-recs.sh`, шаг `main-recs` |
| kp-main-recommendations | Нет рекомендаций сериалов | «no tv recs warns» |
| kp-main-recommendations | Нет функции рекомендаций ядра | «missing recomends get fails visibly» |
