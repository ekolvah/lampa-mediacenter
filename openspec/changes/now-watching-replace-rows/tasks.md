## 0. Delivery start

- [x] 0.1 Правка на ветке PR #69 (tracking issue 68) по ревью пользователя: `start_change` не нужен,
  ветка и worktree уже есть.

## 1. RED

- [x] 1.1 Тесты из карты ниже в `tests/js/kp-reactions-fix.test.js`; `node --test` красный на новых
  и изменённых сценариях. Коммит RED.

## 2. Фильтр штатных рядов (решение 1, 3)

- [x] 2.1 `filterRows` подменяет штатный ряд копией с новинками и `total_pages` полного списка.
  Приписки « · не проверено» нет. Проверка: `node --test tests/js/kp-reactions-fix.test.js`.

## 3. Полный список (решение 2)

- [x] 3.1 Обёртка `KP.list`: пачка страниц, перескок пустой пачки, ошибки. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`.

## 4. Живая проверка и доки

- [x] 4.1 `tests/live/now-watching/rows.js` под новые ряды и 2-ю страницу полного списка.
- [x] 4.2 `docs/lampa-config-review.md`; решения 2 и 6 в архивном design.md помечены заменёнными.
- [ ] 4.3 Пин ветки на приставке (снапшот), `bash tests/live/now-watching.sh` → OK.

## 5. Verify и Deliver

- [ ] 5.1 `openspec validate --strict --all`, `pre-commit run --hook-stage manual --all-files`.
- [ ] 5.2 `agent-process archive_change now-watching-replace-rows`, push, `wait_for_pr 69`.

## Scenario → test map

Все тесты, кроме живого шага, — в `tests/js/kp-reactions-fix.test.js`.

| Спек | Сценарий | Тест |
|---|---|---|
| now-watching-new-releases | Штатный ряд показывает новинки | «original row filtered in place» |
| now-watching-new-releases | Остальные ряды не тронуты | «other rows unchanged» |
| now-watching-new-releases | Ещё остаётся | «more button kept» |
| now-watching-new-releases | Новинки со следующих страниц | «new items from later pages» |
| now-watching-new-releases | Новинок нет | «empty row skipped, warning» |
| now-watching-new-releases | Ряды на приставке | `tests/live/now-watching.sh`, шаг `rows` |
| now-watching-new-releases | Непроверенная в ряду | «unchecked without title suffix» |
| now-watching-new-releases | Страница не загрузилась | «page error marks incomplete» |
| now-watching-new-releases | Ответ не пришёл | «timeout builds partial row» |
| now-watching-new-releases | TMDB не ответил вовремя | «tmdb timeout is unknown» |
| now-watching-new-releases | Страница полного списка | «list page is batch of five» |
| now-watching-new-releases | Последняя пачка | «last batch stops at collection end» |
| now-watching-new-releases | Пустая пачка | «empty batch skipped» |
| now-watching-new-releases | Пачка не загрузилась | «failed batch calls onerror» |
| now-watching-new-releases | Пачка неполная | «partial batch warns» |
| now-watching-new-releases | Другие списки | «other lists untouched» |
