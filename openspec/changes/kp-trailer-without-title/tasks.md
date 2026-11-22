## 0. Delivery start

- [x] 0.1 `agent-process start_change kp-trailer-without-title --planner Claude --implementer Claude`
  (tracking issue 96), дальше работа в `.claude/worktrees/kp-trailer-without-title`.

## 1. RED

- [x] 1.1 Тесты по design.md, решение 3, в `tests/js/kp-reactions-fix.test.js`.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 Обёртка `KP.full` зовёт `trailers(result, null, result.videos, null, …)` при
  `resolveTitle` → `null`; две правки `trailers` под пустой тайтл (решение 1); текст `find failed,
  no reactions` (решение 2). Проверка: `node --test tests/js/kp-reactions-fix.test.js` зелёный.
  Коммит.

## 3. Доки

- [x] 3.1 Шапка `plugins/kp-reactions-fix.js` и строка `kp-reactions-fix.js` в
  `docs/lampa-config-review.md`: вместо «карточка без трейлеров» — «реакций нет, русский трейлер
  сервиса без `season`, если он есть». Проверка: `python scripts/ci_check.py --only links`. Коммит.

## 4. Живая проверка и issue библиотеки

- [x] 4.1 `tests/live/kp-trailers/open-card-no-title.js` (`KP_14897335`, проверка
  `!('reactions' in full)`, `serviceFirst`, `openCard`, `window.__kpRuTrailer`) и блок
  «Буду рядом» с `play_trailer_button` в `tests/live/kp-trailers.sh` (решение 4). Коммит.
- [ ] 4.2 Issue в `ekolvah/trailer-search`: ролик без сверки года и типа. Три примера из design.md,
  наблюдение 2, с запросом и ответом сервиса. Ссылку на issue записать в design.md, Risks.

## 5. Verify

- [ ] 5.1 `/simplify`, коммит его правок.
- [ ] 5.2 Снапшот пина по `docs/snapshots-convention.md`. Пин `kp-reactions-fix.js` на sha ветки,
  `bash tests/live/kp-trailers.sh` → `OK`.
- [ ] 5.3 `openspec validate --strict --all`.
- [ ] 5.4 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.
- [ ] 5.5 Перезапуск Lampa (`am force-stop` + запуск), `screencap` карточки «Буду рядом» с
  трейлером первым (Migration Plan: скрипт перезапускает Lampa до шагов `cdp.py`, не после).

## 6. Deliver

- [ ] 6.1 `agent-process archive_change kp-trailer-without-title`, `gh pr create --title "fix:
  kp-trailer-without-title" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Scenario | Test |
| --- | --- |
| Ролик сервиса без тайтла | `no title: service video only, no tmdb videos or reactions`; `find error warns with imdb_id, card opens` |
| Сервис ролик не дал без тайтла | `no title, service gave nothing: answer as is, warning` |
| Трейлер без тайтла с пульта | `tests/live/kp-trailers.sh` (шаг `kp-trailers/open-card-no-title.js`, блок «Буду рядом») |
| Совпадение не первым результатом | `title match skips first result with other title` |
| Совпадение по оригинальному названию | `original title matches when russian differs` |
| Сравнение без регистра, ё и пунктуации | `title match ignores case, yo and punctuation` |
| Сериал ищется среди сериалов | `tv card searches tv by first air date year` |
| Нет года, совпадение одно | `no year single match searches without year` |
| Нет года, совпадений несколько | `no year ambiguous title warns, no videos` |
| Нет совпадения названия | `no title match warns with title and year` |
| Поиск не удался | `search error warns with title and year, card opens` |
