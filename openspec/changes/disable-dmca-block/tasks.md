## 0. Delivery start

- [x] 0.1 `agent-process start_change disable-dmca-block --planner Claude --implementer Claude`
  (tracking issue 106), дальше работа в `.claude/worktrees/disable-dmca-block`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: в `load()` опция `settings`, то есть
  `window.lampa_settings` контекста. По умолчанию
  `{ dcma: [{ id: 234763, cat: 'tv', kpid: 5304403 }], disable_features: { dmca: false } }`,
  `null` — свойства нет. Новые тесты: `dmca list before and after start reads false` (список
  лежит до `load()`, читается `false`; повторная запись после `load()` — снова `false`) и
  `dmca not disabled: noty and error` (случаи `Object.freeze(settings)` и `settings: null`; в каждом
  `calls.noty` с текстом `DMCA-блокировка не отключена` и `calls.error` с
  `kp-reactions-fix: DMCA block not disabled` — по тексту, потому что другие пути плагина тоже пишут
  туда; обёртка `KP.full` при этом стоит).
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 `disableDmca()` первым шагом `startPlugin()` (решения 1–3), абзац «DMCA» в шапке
  плагина. Проверка: `node --test tests/js/kp-reactions-fix.test.js` зелёный. Коммит.

## 3. Живая проверка

- [x] 3.1 `tests/live/tmdb-access/lib.js`: ожидание загрузки Lampa и вызов с таймаутом из
  `tmdb-unfiltered.js`, который переходит на них (решение 4); ожидание alcopac/tmdbproxy
  остаётся в `tmdb-unfiltered.js`.
- [x] 3.2 `tests/live/tmdb-access/dmca-unblocked.js` (решение 4: фикстура в `/blocked`,
  `Live.waitFor` на `lampa_settings.dcma === false`, `tmdb.full` для `tv/234763`
  не дольше 10 с) и
  `step dmca-unblocked` в `tests/live/tmdb-access.sh`, с комментарием в шапке. Коммит.

## 4. Доки

- [x] 4.1 Строка `kp-reactions-fix.js` в `docs/lampa-config-review.md`: плагин отключает
  DMCA-список CUB (`lampa_settings.dcma` всегда `false`), сбой даёт `Lampa.Noty` и `console.error`,
  живая проверка — `bash tests/live/tmdb-access.sh`. Проверка: `python scripts/ci_check.py --only links`.
  Коммит.

## 5. Verify

- [x] 5.1 `/simplify`, коммит его правок.
- [ ] 5.2 `openspec validate --strict --all` и
  `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`, до выкатки.
- [ ] 5.3 Выкатка по design.md, Migration Plan: `bash tests/live/tmdb-access.sh`, он сам
  перезапускает Lampa.
- [ ] 5.4 Сразу после 5.3, без нового рестарта: с Главной KP открыть «Слово пацана» из ряда
  «Рекомендуем посмотреть сериалы», `screencap` карточки с кнопкой «Торренты»; TMDB-поиск
  «Слово пацана» находит тайтл (`tools/screen.py lampa`).

## 6. Deliver

- [ ] 6.1 `agent-process archive_change disable-dmca-block`, `gh pr create --title "fix:
  disable-dmca-block" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| tmdb-access | Тайтл из DMCA-списка открывается карточкой tmdb | `tests/live/tmdb-access.sh` (шаг `dmca-unblocked`) |
| tmdb-access | Тайтл из DMCA-списка остаётся в выдаче поиска | n/a: ручная проверка 5.4 (`tools/screen.py lampa`), фильтр живёт в UI-компоненте поиска |
| tmdb-access | Список, записанный ядром после старта плагина, не действует | `dmca list before and after start reads false` |
| tmdb-access | Список, записанный до старта плагина, не действует | `dmca list before and after start reads false` |
| tmdb-access | Список не отключён — это видно | `dmca not disabled: noty and error` |
