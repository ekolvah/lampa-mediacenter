## 0. Delivery start

- [x] 0.1 `agent-process start_change trailer-button --planner Claude --implementer Claude`
  (tracking issue 58); войти в `.claude/worktrees/trailer-button` через `EnterWorktree`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: двойники `Lampa.Listener`, `Lampa.Select`, `$` и `e.body`
  с имитацией обработчика `.view--trailer` внутри `load()` (design.md, решение 6), тесты из карты ниже.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 Слушатель `full`/`complite` в `startPlugin`: `.button--kp-trailer` после `.button--play`, только
  при `.view--trailer`; без `.button--play` — предупреждение (решения 1, 4, 5). Проверка: тесты
  «button inserted after play», «no button without trailers», «no play button, warning».
- [x] 2.2 Нажатие: одноразовый перехват `Lampa.Select.show`, `onSelect` первого пункта без `separator`;
  пустой список — исходный `show` и предупреждение; перехват не вызван — предупреждение (решения 2, 3).
  Проверка: «button plays first item via engine onSelect», «empty list shows list, warning»,
  «not intercepted, warning», «Select.show restored», «separator first plays next item». Затем
  `node --test tests/js/kp-reactions-fix.test.js`, коммит группы.

## 3. Живая проверка

- [x] 3.1 `open-card-no-imdb.js` сохраняет первый ролик в `window.__kpRuTrailer` вместо
  `__kpRuTrailerName`; `trailer-focus.js` читает `__kpRuTrailer.name`; `playing.js` при заданном
  `__kpRuTrailer` проверяет, что играет его `key`; общий `openCard()` в `kp-trailers/lib.js`
  сбрасывает `__kpRuTrailer` (`Activity.push` страницу не перезагружает), `open-card-no-imdb.js` задаёт его
  после `openCard` (правка `/simplify`). Новый `button-focus.js` по образцу `menu-focus.js`:
  фокус на `.full-start__button` с текстом «Трейлер». В `kp-trailers.sh` для «Зверя» после
  `open-card-no-imdb` идёт проход кнопкой: `ui.py --keys DPAD_RIGHT` → `button-focus` →
  `ui.py --keys DPAD_CENTER` → `playing`, затем `ui.py --keys DPAD_LEFT` и прежний проход списком.
- [x] 3.2 Выкладка на приставку по design.md, Migration Plan (снапшот, sha головы ветки). Проверка:
  `bash tests/live/kp-trailers.sh` → `OK`. Коммит группы.
  Итог: не `OK` по причине вне кнопки — ролик сервиса `J2VS_OlUJtA` закрыт по региону (#61), и
  «Смотреть» → «Трейлеры» даёт тот же `noplayed`; `playing.js` показывает это как таймаут CDP (#62).
  Кнопка проверена шагами `open-card-no-imdb`, `button-focus` и `Player.playdata().url` =
  ролик сервиса; пользователь принял это 2026-11-16.

## 4. Доки (отдельный коммит)

- [x] 4.1 `docs/lampa-config-review.md`, строка `kp-reactions-fix`: фразу «Трейлеры открываются через
  «Смотреть» → «Трейлеры»…» заменить описанием кнопки «Трейлер». Проверка:
  `python scripts/ci_check.py --only links`.

## 5. Verify

- [x] 5.1 `/simplify`, коммит правок.
- [x] 5.2 `openspec validate --strict --all`.
- [x] 5.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 6. Deliver

- [x] 6.1 `agent-process archive_change trailer-button`, затем
  `gh pr create --title "feat: trailer-button" --body-file <отчёт>`. Отчёт ссылается на #58 простой
  ссылкой.
- [ ] 6.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.
- [ ] 6.3 После мержа — шаг «после мержа» из design.md, Migration Plan.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| kp-card-trailers | Первый ролик списка | `tests/js/kp-reactions-fix.test.js` «button inserted after play», «button plays first item via engine onSelect», «separator first plays next item», «Select.show restored» |
| kp-card-trailers | Список пуст | `tests/js/kp-reactions-fix.test.js` «empty list shows list, warning» |
| kp-card-trailers | Трейлеров нет | `tests/js/kp-reactions-fix.test.js` «no button without trailers» |
| kp-card-trailers | Трейлер одним нажатием с пульта | `tests/live/kp-trailers.sh`, шаги `open-card-no-imdb`, `button-focus`, `playing` для «Зверя» |
