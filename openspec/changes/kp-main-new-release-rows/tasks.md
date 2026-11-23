## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-main-new-release-rows --planner Claude --implementer Claude`
  (tracking issue 114), дальше работа в `.claude/worktrees/kp-main-new-release-rows`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`. Двойник в `load()`:
  - `KP.menu(params, ok)` отдаёт список жанров из опции `genres` (по умолчанию девять из design.md,
    «Standard approach»), `genres: 'never'` — не отвечает; опция `drop: ['KP.menu']` убирает функцию.
  - `KP.list` уже отвечает через `opts.pages(url, page)`; ответы рядов новинок задаются по `url`,
    «не пришёл за 5 с» — `opts.pages`, отдающий `'never'`, и `fireMs(5000)`.
  - `KP.main` двойника считает свои вызовы (их должно быть 0). Ряды `opts.parts` старых тестов
    двойник отдаёт как ответ `KP.list` 1-й страницы их `url`, чтобы фикстуры не переписывать.
  - `home()` возвращает подгрузку в `c.next`; хелпер `drain(c)` зовёт её до `reject` и собирает
    порции.

  Старые тесты, сравнивающие всю первую порцию с «Топ фильмы» в выдаче, поправить по delta
  `kp-main-recommendations`. Тест «other rows unchanged» проверяет новый текст сценария delta
  `now-watching-new-releases`. Тест «missing original row, noty» переименовать в «now watching page 1
  failed warns» и проверять новый сценарий «Штатного ряда нет»: ряда нет, `console.warn`, без
  уведомления — и для ответа `'error'`, и для `'never'` с `fireMs(5000)`. В тесте «recs rows first
  without now watching» 1-я страница обеих коллекций `NOW_WATCHING` отвечает `'error'` (сейчас
  фикстура даёт пустой успешный ответ — это путь «Новинок нет»), а ожидание — два ряда рекомендаций и
  за ними ряды первой порции подгрузки. Ряды новинок, не заданные в `opts.pages`, двойник отдаёт
  пустой 1-й страницей, поэтому дополнение по «Короткой первой порции» не меняет ожиданий прочих
  старых тестов первой порции (с `recs: []` у них 2 ряда и меньше).
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Ряды и запросы (решения 1–3)

- [x] 2.1 Таблица рядов (заголовок, `type`, название жанра) и сборка `url` с окном `Y−1…Y` из
  `noveltyRule(new Date()).minYear`; тот же тест проверяет, что `KP.list` с этим `url` и `page: 2`
  уходит в `kp_source` без изменений. Проверка: `node --test tests/js/kp-reactions-fix.test.js`,
  тест «new release row url».
- [x] 2.2 Первая порция (решение 1): обёртка `KP.main` не зовёт `orgMain`; ряды `NOW_WATCHING` —
  `orgList` 1-й страницы под `waiter` от вызова, дальше `collectPages` с ней как `known`,
  `filterRows`, `addRecs` в конец; `KP.menu` зовётся параллельно под тем же `waiter`; `recsIndex` и
  путь `rowsFailed('no row …')` удалены; 1-я страница не пришла — ряда нет, `console.warn`; не пришли
  обе — `rowsFailed` с причиной. Обёртка отдаёт свою подгрузку. Проверка: та же, тесты «kp rows
  replaced», «now watching page 1 failed warns», «both now watching failed, noty» и тесты
  рекомендаций.
- [x] 2.3 id жанра из ответа `KP.menu` первой порции (2.2) по названию, один раз на подгрузку; нет названия — ряд снят с
  `console.warn`; нет `KP.menu` — жанровые ряды сняты, `rowsFailed(missingFns(['Api.sources.KP.menu']))`;
  нет ни одного жанра таблицы (пустой список, ответ `KP.menu` не пришёл за `ROWS_TIMEOUT_MS` того же
  `waiter` первой порции) — так же, `rowsFailed` с причиной. Проверка: та же, тесты «missing genre warns», «no kp
  menu keeps top rows», «empty kp menu noty», «late kp menu noty». Коммит группы.

## 3. Подгрузка и повторы (решения 4–5)

- [x] 3.1 Подгрузка порциями по 5 на `waiter` с `ROWS_TIMEOUT_MS`, ряды по порядку таблицы,
  пустая порция — следующая, конец — `reject`; ошибка и таймаут ряда — `console.warn` с заголовком
  и причиной; подгрузка держит только набор `id`, номер ряда и id жанров (решение 4). Проверка: та
  же, тесты «rows in portions of five», «empty portion loads next», «failed and late rows warn».
- [x] 3.2 Набор `id` на вызов `KP.main`: показанные «Сейчас смотрят», затем ряды новинок по мере
  выдачи; пустой после чистки ряд снят. Проверка: та же, тесты «now watching card not repeated»,
  «repeat across portions removed», «row of repeats dropped».
- [x] 3.3 Первая порция меньше 3 рядов дописывается порциями подгрузки до 3 или `reject`; пустая и
  после этого — `onerror` `KP.main` (design.md, решение 1). Проверка: та же, тесты «short first
  portion padded», «empty main calls onerror». Коммит группы.

## 4. Доки

- [x] 4.1 `docs/lampa-config-review.md`: строка `kp_source.js` (какие ряды Главной он больше не
  даёт), строка `kp-reactions-fix.js` (ряды новинок, чистка повторов), «Итог по плагинам» и раздел
  о рядах `kp_source` на Главной — описать текущее состояние, старое удалить. Шапка
  `plugins/kp-reactions-fix.js`. Коммит.

## 5. Живая проверка

- [ ] 5.1 `lines` и `waitHome` из `tests/live/now-watching/lib.js` перенести в `tests/live/lib.js`
  (его подключает каждый `step`), `bash tests/live/now-watching.sh` → OK.
- [ ] 5.2 `tests/live/main-rows.sh` (`DIR=tests/live/main-rows`, `restart_lampa`, затем шаг
  `rows`). Шаг `tests/live/main-rows/rows.js` ждёт Главную через `waitHome`, зовёт
  `Lampa.Api.sources.KP.main` и его подгрузку до `reject` и проверяет сценарий «Главная на
  приставке»: рядов «Топ фильмы»/«Популярные …» нет; ряды новинок — подпоследовательность таблицы в
  её порядке; у всех карточек рядов новинок год не раньше `Y−1`; повторов `id` между рядами
  Кинопоиска («Сейчас смотрят» и ряды новинок, без рядов рекомендаций) нет;
  `KP.list({url: <Топ новинок: фильмы>, page: 2})` непустой.
- [ ] 5.3 Снапшот пина по `docs/snapshots-convention.md`, пин `kp-reactions-fix.js` на sha ветки,
  `bash tests/live/main-rows.sh` → OK, `bash tests/live/main-recs.sh` → OK (`now-watching.sh` уже
  прошёл в 5.1). Затем `screencap` Главной после прокрутки до рядов новинок (процесс уже перезапущен
  скриптом). Коммит.

## 6. Verify

- [ ] 6.1 `/simplify`, коммит его правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change kp-main-new-release-rows`, затем
  `gh pr create --title "feat: kp-main-new-release-rows" --body-file <отчёт>` (issue простой
  ссылкой), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`.
- [ ] 7.2 После merge — Migration Plan из design.md, затем `bash tests/live/main-rows.sh` → OK.

## Scenario → test map

Все тесты, кроме живых шагов, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| kp-main-new-release-rows | Ряды kp_source заменены | «kp rows replaced» |
| kp-main-new-release-rows | Запрос ряда | «new release row url» |
| kp-main-new-release-rows | «Ещё» ряда новинок | «new release row url» |
| kp-main-new-release-rows | Карточка из «Сейчас смотрят» | «now watching card not repeated» |
| kp-main-new-release-rows | Повтор между порциями подгрузки | «repeat across portions removed» |
| kp-main-new-release-rows | Ряд из одних повторов | «row of repeats dropped» |
| kp-main-new-release-rows | Порции по 5 | «rows in portions of five» |
| kp-main-new-release-rows | Пустая порция | «empty portion loads next» |
| kp-main-new-release-rows | Первая порция дополнена | «short first portion padded» |
| kp-main-new-release-rows | Рядов нет совсем | «empty main calls onerror» |
| kp-main-new-release-rows | Ряд не ответил | «failed and late rows warn» |
| kp-main-new-release-rows | Нет жанра | «missing genre warns» |
| kp-main-new-release-rows | Нет KP.menu | «no kp menu keeps top rows» |
| kp-main-new-release-rows | Пустой список жанров | «empty kp menu noty» |
| kp-main-new-release-rows | KP.menu не ответил | «late kp menu noty» |
| kp-main-new-release-rows | Главная на приставке | `tests/live/main-rows.sh`, шаг `rows` |
| now-watching-new-releases | Штатный ряд показывает новинки | «original row filtered in place» |
| now-watching-new-releases | Остальные ряды не тронуты | «other rows unchanged» (ожидание по delta) |
| now-watching-new-releases | Ещё остаётся | «more button kept» |
| now-watching-new-releases | Новинки со следующих страниц | «new items from later pages» |
| now-watching-new-releases | Новинок нет | «empty row skipped, warning» |
| now-watching-new-releases | Ряды на приставке | `tests/live/now-watching.sh`, шаг `rows` |
| now-watching-new-releases | Штатного ряда нет | «now watching page 1 failed warns» (переименован из «missing original row, noty») |
| now-watching-new-releases | Обоих штатных рядов нет | «both now watching failed, noty» |
| now-watching-new-releases | Перехват опоздал | «late patch, noty» |
| kp-main-recommendations | Два ряда за «Сейчас смотрят» | «recs rows after now watching» (ожидание без «Топ фильмы») |
| kp-main-recommendations | Ряд «Сейчас смотрят» без новинок | «recs rows keep place of hidden row» (ожидание по delta) |
| kp-main-recommendations | Рядов «Сейчас смотрят» нет | «recs rows first without now watching» (ожидание по delta: 1-е страницы `'error'`, за рекомендациями ряды подгрузки) |
| kp-main-recommendations | Не больше 40 карточек | «recs row capped at 40, pages counted» |
| kp-main-recommendations | «Ещё» ряда сериалов | «recs tv more opens core screen» |
