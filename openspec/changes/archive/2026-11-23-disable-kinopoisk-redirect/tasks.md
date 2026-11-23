## 0. Delivery start

- [x] 0.1 `agent-process start_change disable-kinopoisk-redirect --planner Claude --implementer Claude`
  (tracking issue 110), дальше работа в `.claude/worktrees/disable-kinopoisk-redirect`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: умолчание опции `settings` в `load()` получает
  `disable_features: { kinopoisk: false }`; новая опция `launched` — значение `window.app_time_launch`
  (по умолчанию не задан). Новые тесты: `kinopoisk list disabled before app start` (флаг `true`, нет
  сообщений решения 2) и `kinopoisk list not disabled: noty and error` (случаи `launched: 1` и
  `settings: null`; в каждом по одному сообщению решения 2 в `calls.noty` и `calls.error`,
  `KP.__reactions_patched` — `true`).
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 `disableKinopoisk()` первым шагом `startPlugin()` рядом с `disableDmca()` (решения 1–2),
  абзац «Кинопоиск» в шапке плагина. Проверка: `node --test tests/js/kp-reactions-fix.test.js`
  зелёный. Коммит.

## 3. Живая проверка

- [x] 3.1 `tests/live/tmdb-access/kinopoisk-card.js` (решение 3) и `step kinopoisk-card` в
  `tests/live/tmdb-access.sh`, с упоминанием change в шапке. Коммит.

## 4. Доки

- [x] 4.1 Строка `kp-reactions-fix.js` в `docs/lampa-config-review.md`: плагин отключает список CUB
  «смотреть на Кинопоиске», сбой виден. Проверка: `python scripts/ci_check.py --only links`. Коммит.

## 5. Verify

- [x] 5.1 `/simplify`, коммит его правок.
- [x] 5.2 `openspec validate --strict --all` и
  `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.
- [x] 5.3 Выкатка по design.md, Migration Plan, на sha ветки: снапшот, смена sha плагина,
  `bash tests/live/tmdb-access.sh`.

## 6. Deliver

- [x] 6.1 `agent-process archive_change disable-kinopoisk-redirect`, `gh pr create --title "fix:
  disable-kinopoisk-redirect" --body-file <report>`, `gh pr merge <PR> --auto --squash`,
  `agent-process wait_for_pr <PR>`.

## Scenario → test map

| Capability | Scenario | Test |
| --- | --- | --- |
| tmdb-access | Карточка из списка Кинопоиска с кнопками плагина | `tests/live/tmdb-access.sh` (шаг `kinopoisk-card`) |
| tmdb-access | Флаг записан до старта приложения | `kinopoisk list disabled before app start` |
| tmdb-access | Список Кинопоиска не отключён — это видно | `kinopoisk list not disabled: noty and error` |
