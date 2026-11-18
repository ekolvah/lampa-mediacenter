## 0. Delivery start

- [x] 0.1 `agent-process start_change torrents-button --planner Claude --implementer Claude`
  (tracking issue 70); войти в `.claude/worktrees/torrents-button` через `EnterWorktree`.

## 1. RED

- [x] 1.1 `tests/js/kp-reactions-fix.test.js`: двойники по design.md, решение 5; тесты из карты ниже;
  существующие тесты трейлера переходят с `after(button)` на `after(buttons)`.
- [x] 1.2 `agent-process check_red tests/test_plugin_js.py::test_plugin_js`, коммит RED.

## 2. Плагин

- [x] 2.1 `onFull` с `complite`: общий `cardButton`, «Торренты» и «Трейлер» на месте `play`, без
  `play` — одно предупреждение (решения 1–3). Проверка: строки карты `card-buttons` и
  `kp-card-trailers` с юнит-тестами.
- [x] 2.2 `onFull` с `options`: пункт «Смотреть» (решение 4). Проверка:
  `node --test tests/js/kp-reactions-fix.test.js`, коммит группы.

## 3. Живая проверка

- [x] 3.1 `tests/live/kp-trailers/lib.js`: `openCard` ждёт фокус на `.button--kp-torrent`, а не на
  «Смотреть». `button-focus.js`: комментарий «DPAD_RIGHT с «Торренты»». Новый `torrents-open.js`:
  активный компонент `torrents`, его `movie.id` — id карточки. В `kp-trailers.sh`:
  - `play_first_trailer` начинается с `ui.py --keys "DPAD_RIGHT x4,DPAD_CENTER,DPAD_CENTER,DPAD_DOWN x3"`
    («Торренты», «Трейлер», «Избранное», «Реакции», «…»; «Подписаться» скрыта; меню «Еще» → первый
    пункт «Смотреть» → «Трейлеры») → `menu-focus` → прежний запуск. Число нажатий проверяет
    `menu-focus`.
  - «Зверь»: `play_trailer_button open-card-no-imdb`, затем `play_first_trailer`, как сейчас.
  - «1+1»: `step open-card` → `ui.py --keys DPAD_CENTER` → `torrents-open` → `ui.py --keys BACK` →
    `play_trailer_button` без шага открытия (аргумент шага становится необязательным) вместо
    `play_first_trailer`: путь через «…» уже прошёл «Зверь».
  - «Джентльмены»: без изменений.
  - Комментарии про фокус на «Смотреть» исправить.
- [x] 3.2 Выкладка на приставку по design.md, Migration Plan (снапшот, sha головы ветки). Проверка:
  `bash tests/live/kp-trailers.sh` → `OK`; затем рестарт Lampa и один `screencap` строки кнопок
  (CLAUDE.md: прогон уводил Lampa в фон через SmartTube; вёрстка — вопрос визуальный). Коммит группы.

## 4. Доки (отдельный коммит)

- [x] 4.1 `docs/lampa-config-review.md`: строка `kp-reactions-fix` — кнопки «Торренты» и «Трейлер»,
  «Смотреть» в «…»; абзац «Плеер для трейлеров»: «Смотреть» → «Трейлеры» заменить на «…» →
  «Смотреть» → «Трейлеры». Проверка: `python scripts/ci_check.py --only links`.

## 5. Verify

- [ ] 5.1 `/simplify`, коммит правок.
- [ ] 5.2 `openspec validate --strict --all`.
- [ ] 5.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 6. Deliver

- [ ] 6.1 `agent-process archive_change torrents-button`, затем
  `gh pr create --title "feat: torrents-button" --body-file <отчёт>`. Отчёт ссылается на трекинг-issue
  простой ссылкой.
- [ ] 6.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.
- [ ] 6.3 После мержа — шаг «после мержа» из design.md, Migration Plan.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| card-buttons | Торренты одним нажатием | `tests/js/kp-reactions-fix.test.js` «torrent button first, opens torrents» |
| card-buttons | Торренты выключены | `tests/js/kp-reactions-fix.test.js` «no torrent button without enabled source» |
| card-buttons | Торренты с пульта | `tests/live/kp-trailers.sh`, шаги `open-card`, `torrents-open` для «1+1» |
| card-buttons | Смотреть убран из строки | `tests/js/kp-reactions-fix.test.js` «play removed» |
| card-buttons | Смотреть в меню «…» | `tests/js/kp-reactions-fix.test.js` «watch item first in options, emits watch» |
| card-buttons | Нет кнопки «Смотреть» | `tests/js/kp-reactions-fix.test.js` «no play button, warning» (дополнен) |
| card-buttons | Смотреть из «…» с пульта | `tests/live/kp-trailers.sh`, `play_first_trailer` для «Зверя», шаг `menu-focus` |
| kp-card-trailers | Первый ролик списка | `tests/js/kp-reactions-fix.test.js` «trailer after torrent», «button plays first item via engine onSelect», «separator first plays next item», «Select.show restored» |
| kp-card-trailers | Без торрентов | `tests/js/kp-reactions-fix.test.js` «trailer first without torrents» |
| kp-card-trailers | Список пуст | `tests/js/kp-reactions-fix.test.js` «empty list shows list, warning» |
| kp-card-trailers | Трейлеров нет | `tests/js/kp-reactions-fix.test.js` «no button without trailers» |
| kp-card-trailers | Трейлер одним нажатием с пульта | `tests/live/kp-trailers.sh`, шаги `open-card-no-imdb`, `button-focus`, `playing` для «Зверя» |
| kp-card-trailers | Русский трейлер последнего сезона | `tests/js/kp-reactions-fix.test.js` «last season 2: service asked with season despite ru video, its video first» |
| kp-card-trailers | Объявленный сезон не считается | `tests/js/kp-reactions-fix.test.js` «last season from last episode, not number of seasons» |
| kp-card-trailers | Трейлер сезона из TMDB | `tests/js/kp-reactions-fix.test.js` «service gave nothing: newest TMDB season trailer first, warning» |
| kp-card-trailers | Видео сезона нет | `tests/js/kp-reactions-fix.test.js` «no season trailer, error or timeout: TMDB videos, warning» |
| kp-card-trailers | Сведения о сериале не получены | `tests/js/kp-reactions-fix.test.js` «tv details error: film behaviour, warning with id» |
| kp-card-trailers | Трейлер последнего сезона с пульта | `tests/live/kp-trailers.sh`, «Джентльмены»: `open-card-season`, `button-focus`, `playing` |
| kp-card-trailers | Русский трейлер с пульта (не в дельте, путь сменился) | `tests/live/kp-trailers.sh`, «Зверь» списком через «…»: `menu-focus`, `trailer_plays`, `playing` (id = `__kpRuTrailer.key`) |
| kp-card-trailers | Запуск трейлера пультом (не в дельте, путь сменился) | `tests/live/kp-trailers.sh`, «Зверь» списком через «…»: `menu-focus`, `trailer_plays`, `playing`; «1+1» теперь кнопкой |
