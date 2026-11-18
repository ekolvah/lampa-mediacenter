## 0. Delivery start

- [x] 0.1 `agent-process start_change now-watching-new-releases --planner Claude --implementer Claude`
  (tracking issue 68); войти в `.claude/worktrees/now-watching-new-releases` через `EnterWorktree`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: расширить `load()` по design.md, решение 7; написать
  тесты из карты ниже.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Фильтр

- [x] 2.1 `isNewRelease(card, today, lastEpisodeDate)` на `releaseDate` (решение 4). Проверка: тесты
  карты для требований «Новинка-фильм» и «Новинка-сериал».

## 3. Ряды

- [x] 3.1 Обёртка `KP.main` в `patch()`: первая порция проходит `insertRows`, подгрузка отдаётся без
  изменений, штатные ряды по `url`, `total_pages: 1` (решение 2). Проверка: тесты карты для
  «Ряды стоят за штатными».
- [x] 3.2 Сбор страниц 2–5 через `KP.list`, срок `ROWS_TIMEOUT_MS` по образцу `seasonTrailer`,
  « · неполный», пустой ряд не вставляется (решение 3). Проверка: тесты карты для «Новинки со
  следующих страниц», «Новинок нет» и требования «Неполная выборка видна».
- [x] 3.3 Сериалы со старым стартом: `resolveTitle` → `lastSeason`, нейтральные тексты его двух
  предупреждений, `'unknown'` с warn, число непроверенных в заголовке (решения 5, 6). Проверка: тесты
  карты для «Новый сезон старого сериала» … «TMDB не ответил» и «Непроверенные карточки видны»;
  существующие тесты трейлеров зелёные.
- [x] 3.4 Нет штатного ряда в первой порции или Главная KP уже на экране в момент `patch()` →
  `Lampa.Noty.show` и `console.error`, порция без изменений (решение 2). Проверка: «missing original
  row, noty», «late patch, noty». Затем
  `node --test tests/js/kp-reactions-fix.test.js`, коммит группы.

## 4. Живая проверка

- [x] 4.1 `tests/live/now-watching.sh` и шаг `tests/live/now-watching/rows.js` по design.md,
  решение 7. Скрипт перезапускает Lampa на экран: перед запуском спросить пользователя, не смотрит
  ли он что-то.
- [x] 4.2 Выкладка на приставку по design.md, Migration Plan (снапшот, sha головы ветки). Проверка:
  `bash tests/live/now-watching.sh` → `OK`; затем пользователь сверяет ряды глазами. Коммит группы.

## 5. Доки (отдельный коммит)

- [x] 5.1 `docs/lampa-config-review.md`: строка `kp-reactions-fix` — ряды новинок на Главной; абзац
  «Свой плагин. Штатный путь `ContentRows`…» — ссылка на ряды новинок как пример обёртки `main`.
  Шапка `plugins/kp-reactions-fix.js` — что плагин держит и Главную (решение 1). Проверка:
  `python scripts/ci_check.py --only links`.

## 6. Verify

- [x] 6.1 `/simplify`, коммит правок.
- [ ] 6.2 `openspec validate --strict --all`.
- [ ] 6.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 7. Deliver

- [ ] 7.1 `agent-process archive_change now-watching-new-releases`, затем
  `gh pr create --title "feat: now-watching-new-releases" --body-file <отчёт>`. Отчёт ссылается на
  tracking issue простой ссылкой.
- [ ] 7.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.
- [ ] 7.3 После мержа — шаг «после мержа» из design.md, Migration Plan.

## Scenario → test map

Все тесты, кроме живого шага, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| now-watching-new-releases | Ряды стоят за штатными | «rows inserted after originals», «originals unchanged», «no more button» |
| now-watching-new-releases | Новинки со следующих страниц | «new items from later pages» |
| now-watching-new-releases | Новинок нет | «empty row skipped, warning» |
| now-watching-new-releases | Ряды на приставке | `tests/live/now-watching.sh`, шаг `rows` |
| now-watching-new-releases | Прошлый год в январе | «january keeps last year» |
| now-watching-new-releases | Позапрошлый год | «year before last is old» |
| now-watching-new-releases | Будущий год | «future year is new» |
| now-watching-new-releases | Год пустой | «empty year is unknown» |
| now-watching-new-releases | Новый сериал | «new series no tmdb» |
| now-watching-new-releases | Новый сезон старого сериала | «new season of old series», «last episode boundary 365 days» |
| now-watching-new-releases | Старый сериал без новых эпизодов | «old series without new episodes» |
| now-watching-new-releases | Пары в TMDB нет | «no tmdb pair is unknown» |
| now-watching-new-releases | TMDB не ответил | «tmdb error is unknown» |
| now-watching-new-releases | Нет даты последнего эпизода | «no last episode is unknown» |
| now-watching-new-releases | Две непроверенные | «unknown count in title» |
| now-watching-new-releases | Все проверены | «no suffix when all checked» |
| now-watching-new-releases | Страница не загрузилась | «page error marks incomplete» |
| now-watching-new-releases | Ответ не пришёл | «timeout builds partial row» |
| now-watching-new-releases | TMDB не ответил вовремя | «tmdb timeout is unknown» |
| now-watching-new-releases | Штатного ряда нет | «missing original row, noty» |
| now-watching-new-releases | Перехват опоздал | «late patch, noty» |
