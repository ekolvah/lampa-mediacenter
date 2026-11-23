## 0. Delivery start

- [x] 0.1 `agent-process start_change favorites-dedup-across-sources --planner Claude --implementer Claude`
  (tracking issue 112), дальше работа в `.claude/worktrees/favorites-dedup-across-sources`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: в `load()` опция `bookmarks` (массив `{type, data}` в
  порядке ядра; записи `history` — из прежней опции `history`, так что `Favorite.get` двойника идёт
  через `Account.Bookmarks.get` и тесты `recs` проходят через обёртку): двойник
  `Account.Bookmarks.get` отдаёт его по типу, `Favorite.check` ищет запись по
  `id` по всем типам, `Favorite.toggle`/`remove` пишут аргументы в `calls.toggles`/`calls.removes`
  (`toggle` отвечает, как ядро: `false`, если запись была) и списка не меняют — как ядро при
  синхронизации до обновления через 500 мс (design, решение 3); опция `sync` (по умолчанию `true`) —
  геттер `Account.Permit.sync`; `drop` уже убирает функцию двойника. Что обёртка
  `Bookmarks.get` доходит до `Favorite.all()`, проверяет живой тест (design, наблюдения 2–3). Тесты:
  `book list shows one card per imdb` (KP-запись первой, показана `tmdb` на её месте),
  `card without imdb kept`, `dup in other type kept`, `check finds same imdb other source`,
  `check finds pair despite own history`, `toggle removes all records of imdb` (точный список
  `calls.removes`, без уже снятой), `toggle does not add second record`, `exclusive mark moves on paired record`,
  `recs with tmdb and kp pair in history`, `no sync passes to core` (флаг переключается между
  вызовами), `missing favorites fn fails visibly` (цикл по `drop` для каждой функции решения 5, по
  образцу `missing recomends get fails visibly`: имя в `calls.noty` и `calls.error`, функции ядра
  не подменены).
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 Раздел «Закладки» в `plugins/kp-reactions-fix.js`: обёртка `Lampa.Account.Bookmarks.get`
  (решение 2), обёртки `Lampa.Favorite.check`/`toggle` (решения 1, 3), проверки и сообщения
  (решение 5), вызов из `startPlugin()`, абзац в шапке. Проверка:
  `node --test tests/js/kp-reactions-fix.test.js` зелёный, включая прежние тесты `recs`/`history`
  (Risks). Коммит.

## 3. Живая проверка

- [ ] 3.1 `tests/live/favorites/one-card.js` и `tests/live/favorites.sh` по образцу
  `tests/live/tmdb-access.sh` (`restart_lampa` и `step one-card` из `tests/live/lib.sh`; в шаге
  `Live.waitFor` загрузки закладок и `Live.check` из `tests/live/lib.js`; в шапке — когда гонять:
  перед сменой sha `plugins/kp-reactions-fix.js` и после): только чтение — в каждом типе
  `Lampa.Favorite.get` и в `Lampa.Favorite.all()` нет двух записей с одним непустым `imdb_id`; для
  записи `book` с `imdb_id` синтетическая карточка `{ id: 'KP_0', source: 'KP', imdb_id }` получает
  `Lampa.Favorite.check(...).book === true`. Коммит.

## 4. Доки

- [ ] 4.1 Строка `kp-reactions-fix.js` в `docs/lampa-config-review.md`: закладки одного `imdb_id`
  схлопываются при чтении, кнопка закладок снимает все записи тайтла, сбой — `Lampa.Noty`/`console.error`,
  без синхронизации — `console.warn`; живая проверка — `bash tests/live/favorites.sh`. Проверка:
  `python scripts/ci_check.py --only links`. Коммит.

## 5. Verify

- [ ] 5.1 `/simplify`, коммит его правок.
- [ ] 5.2 `openspec validate --strict --all` и
  `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`, до выкатки.
- [ ] 5.3 Выкатка по design.md, Migration Plan: `bash tests/live/favorites.sh`.
- [ ] 5.4 Сразу после 5.3: экран «Избранное» → «Закладки» показывает «Список смертников» одной
  карточкой (`tools/screen.py lampa`). Закладку не снимать — это правка аккаунта пользователя.

## 6. Deliver

- [ ] 6.1 `agent-process archive_change favorites-dedup-across-sources`, `gh pr create --title "fix:
  favorites-dedup-across-sources" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| favorites-across-sources | Один сериал из TMDB и из KP | `book list shows one card per imdb`, `dup in other type kept`, `recs with tmdb and kp pair in history`, `tests/live/favorites.sh` |
| favorites-across-sources | Запись без imdb_id | `card without imdb kept` |
| favorites-across-sources | KP-карточка тайтла, сохранённого из TMDB | `check finds same imdb other source`, `tests/live/favorites.sh` |
| favorites-across-sources | Проигранная KP-карточка | `check finds pair despite own history` |
| favorites-across-sources | Взаимоисключающая метка не разъезжается | `exclusive mark moves on paired record` |
| favorites-across-sources | Снятие при двух записях | `toggle removes all records of imdb` |
| favorites-across-sources | Добавление второй записи не происходит | `toggle does not add second record` |
| favorites-across-sources | Нет функции ядра | `missing favorites fn fails visibly` |
| favorites-across-sources | Нет синхронизации | `no sync passes to core` |
