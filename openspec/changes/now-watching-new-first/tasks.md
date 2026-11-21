## 0. Delivery start

- [x] 0.1 `agent-process start_change now-watching-new-first --planner Claude --implementer Claude`
  (tracking issue 79), дальше работа в `.claude/worktrees/now-watching-new-first`.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`.
  - Двойник `Storage` не меняется. В `load()` опция `seen` — ещё один ключ начального `store`
    (`kp_now_watching_seen`).
  - Следующая сборка Главной — `homeWith({ seen: plain(c.store.kp_now_watching_seen), today })`.
  - Записи считаются по `c.sets`.
  - Открытие карточки — `KP.full({ card: { id, source: 'KP' } }, …)`, как зовёт ядро (design.md,
    Standard approach).
  - Тест «new series no tmdb» переименовать в «new series new despite tmdb error» и переписать под
    изменённый сценарий.
  - Вне карты — тест «unchanged memory not rewritten» (design.md, R20).
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Память и порядок (решения 1, 2, 5, 6)

- [x] 2.1 Чтение ключа с проверкой формы и `console.warn` при порче. `orderByNovelty` — чистая функция
  (новые первыми, устойчиво; первый запуск; чистка по `l`). Её зовёт колбэк завершения
  `filterRows`, «сейчас» — тот же `new Date()`, что для `noveltyRule`. Один `Storage.set` за сборку,
  только при изменении и после `oncomplite(out)`. `filteredRow` и `listBatch` не трогать. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`. Коммит группы.

## 3. Сезон сериала (решение 3)

- [x] 3.1 `lastEpisode` отдаёт `{ number, date }`, `collectPages` кладёт номер в `item`.
  Необязательный аргумент `collectPages` `needSeason(card)`: в `addPage` сезон спрашивается под тем же
  `pending()` у сериалов, стартовавших не раньше прошлого года, для которых предикат истинен.
  `filterRows` передаёт предикат «есть в памяти ряда», `listBatch` — нет. При неудаче у запомненного
  сериала — одно предупреждение «season unknown» с `reason` из `lastEpisode`. Ожидания старых тестов
  не меняются. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`. Коммит группы.

## 4. «Открыли» (решение 4)

- [x] 4.1 Обёртка `KP.full`: после вызова `orgFull` — `f = 0` по `params.card.id` в рядах памяти,
  запись ключа только при изменении. Проверка: та же. Коммит группы.

## 5. Доки

- [x] 5.1 `docs/lampa-config-review.md`: в строке `kp-reactions-fix.js` описать порядок ряда, ключ
  `kp_now_watching_seen` и запросы TMDB о сезоне для запомненных новых сериалов. Обновить шапку
  `plugins/kp-reactions-fix.js`. Коммит.

## 6. Живая проверка

- [x] 6.1 `tests/live/now-watching/lib.js`: из `rows.js` вынести `URLS`, `lines()`, ожидание Главной
  и поиск ряда по `url`, `rows.js` перевести на них.
- [x] 6.2 Шаги в `tests/live/now-watching.sh` по образцу `tests/live/kp-history-recs.sh`: значения
  между шагами — вторым аргументом `step`; перед каждым `restart_lampa` после записи в `Storage` —
  `sleep 15` (WebView пишет localStorage на диск с задержкой).
  1. `new-first.js`: в `kp_now_watching_seen` есть оба ряда. Из памяти ряда фильмов удаляется id
     карточки не с первого места, шаг возвращает id.
  2. `restart_lampa`, `new-first-check.js` с `ID`: карточка первая в ряду. Затем `KP.full` с её
     `card`.
  3. `restart_lampa`, `new-first-check.js` с `ID` и режимом «открыта»: карточка на месте по коллекции.
- [x] 6.3 Снапшот пина и ключа по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha
  ветки, затем `bash tests/live/now-watching.sh` → OK. После него рестарт процесса и `screencap`
  Главной (проверка после живых рестартов из CLAUDE.md). Коммит скриптов.

## 7. Verify

- [ ] 7.1 `/simplify`, коммит его правок.
- [ ] 7.2 `openspec validate --strict --all`.
- [ ] 7.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 8. Deliver

- [ ] 8.1 `agent-process archive_change now-watching-new-first`, затем
  `gh pr create --title "feat: now-watching-new-first" --body-file <отчёт>` (issue #79 простой
  ссылкой), `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`.
- [ ] 8.2 После merge — Migration Plan из design.md: пин на sha `main` со снапшотом, затем
  `bash tests/live/now-watching.sh` → OK.

## Scenario → test map

Все тесты, кроме живых шагов, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| now-watching-new-releases | Новый сериал | «new series new despite tmdb error» |
| now-watching-new-releases | Новый сезон старого сериала | «new season of old series», «last episode boundary 365 days» |
| now-watching-new-releases | Старый сериал без новых эпизодов | «old series without new episodes» |
| now-watching-new-releases | Пары в TMDB нет | «no tmdb pair is unknown» |
| now-watching-new-releases | TMDB не ответил | «tmdb error is unknown» |
| now-watching-new-releases | Нет даты последнего эпизода | «no last episode is unknown» |
| now-watching-new-releases | Штатный ряд показывает новинки | «original row filtered in place» |
| now-watching-new-releases | Остальные ряды не тронуты | «other rows unchanged» |
| now-watching-new-releases | Ещё остаётся | «more button kept» |
| now-watching-new-releases | Новинки со следующих страниц | «new items from later pages» |
| now-watching-new-releases | Новинок нет | «empty row skipped, warning» |
| now-watching-new-releases | Ряды на приставке | `tests/live/now-watching.sh`, шаг `rows` |
| now-watching-new-releases | Новая карточка первой | «new card first», `tests/live/now-watching.sh`, шаг `new-first-check` |
| now-watching-new-releases | Две новые карточки | «newest appearance first» |
| now-watching-new-releases | Новые в одну сборку | «same build keeps collection order» |
| now-watching-new-releases | Пять дней прошли | «new card back after five days» |
| now-watching-new-releases | Открытая карточка | «opened card back in place», `tests/live/now-watching.sh`, шаг `new-first-check` (открыта) |
| now-watching-new-releases | Полный список без подъёма | «full list keeps collection order» |
| now-watching-new-releases | Вышел новый сезон | «new season raises opened series» |
| now-watching-new-releases | Сезон тот же | «same season stays» |
| now-watching-new-releases | Сезон не получен | «season unknown keeps place, one warning» |
| now-watching-new-releases | TMDB не ответил о сезоне | «tmdb season timeout builds home» |
| now-watching-new-releases | Сезон стал известен | «season learned without raise» |
| now-watching-new-releases | Сериал впервые в ряду | «unseen series raised without season request» |
| now-watching-new-releases | Первый запуск | «first run seeds memory», `tests/live/now-watching.sh`, шаг `new-first` |
| now-watching-new-releases | Первый запуск с неполным рядом | «incomplete first run not seeded» |
| now-watching-new-releases | Вернувшаяся карточка | «returning card not new» |
| now-watching-new-releases | Давно нет в ряду | «absent 31 days forgotten, 29 days remembered» |
| now-watching-new-releases | Недавно был в ряду | «absent 31 days forgotten, 29 days remembered» |
| now-watching-new-releases | Испорченная память | «corrupt memory reseeded, warning» |
