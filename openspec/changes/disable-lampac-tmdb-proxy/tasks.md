## 0. Delivery start

- [x] 0.1 `agent-process start_change disable-lampac-tmdb-proxy --planner Claude --implementer Claude`
  (tracking issue 73); войти в `.claude/worktrees/disable-lampac-tmdb-proxy` через `EnterWorktree`.

## 1. RED

- [ ] 1.1 `tests/live/tmdb-access.sh` по образцу `now-watching.sh` (`restart_lampa`,
  `step tmdb-unfiltered`, `OK: tmdb-access`) и шаг `tests/live/tmdb-access/tmdb-unfiltered.js`
  (design.md, решение 2). `find` — обёрткой над `Lampa.Api.sources.tmdb.get` в стиле `kpFull`
  из `tests/live/kp-trailers/lib.js`, вызов как в `plugins/kp-reactions-fix.js:250`.
- [ ] 1.2 no RED: живая проверка, не pytest (`check_red` её не запускает). RED: `bash
  tests/live/tmdb-access.sh` до правки флажка падает с адресом `beta.l-vid.online`. Коммит RED.

## 2. Приставка

- [ ] 2.1 Снапшот по [docs/snapshots-convention.md](../../../docs/snapshots-convention.md):
  `snapshots/<дата>_disable-tmdbproxy/NOTES.md` (что, зачем, проверка, откат из design.md),
  `before/` — `alcopac_plug_tmdbproxy` и вывод RED из 1.2.
- [ ] 2.2 `Lampa.Storage.set('alcopac_plug_tmdbproxy', false)` через `tools/cdp.py`. Проверка —
  сценарии `tmdb-access`: `bash tests/live/tmdb-access.sh` (сам перезапускает Lampa) →
  `OK: tmdb-access`; напечатанные префиксы — в `NOTES.md`.
- [ ] 2.3 Регрессии (design.md, риски): `bash tests/live/kp-trailers.sh` → `OK: kp-trailers`,
  `bash tests/live/now-watching.sh` → OK, Главная KP и постеры — `screencap` (вопрос визуальный).
  `after/` и итог в `NOTES.md`.

## 3. Доки (отдельный коммит)

- [ ] 3.1 `docs/lampa-config-review.md`: строку про TMDB в «Текущем состоянии», строку
  `beta.l-vid.online/on.js` таблицы плагинов и абзац о служебном бандле привести к состоянию
  «`tmdbproxy` выключен, его прокси вырезает тайтлы (#73)»; старый текст удалить. В строке `on.js`
  и строке про TMDB — «Живая проверка — `bash tests/live/tmdb-access.sh`»: после любой правки
  `on.js` или настроек аккаунта Lampac и перед правкой плагина, ходящего в TMDB. Проверка:
  `python scripts/ci_check.py --only links`.

## 4. Verify

- [ ] 4.1 `/simplify`, коммит правок.
- [ ] 4.2 `openspec validate --strict --all`.
- [ ] 4.3 `pre-commit run --hook-stage manual --all-files --show-diff-on-failure`.

## 5. Deliver

- [ ] 5.1 `agent-process archive_change disable-lampac-tmdb-proxy`, затем
  `gh pr create --title "fix: disable-lampac-tmdb-proxy" --body-file <отчёт>`. Отчёт ссылается на
  #73 простой ссылкой.
- [ ] 5.2 `gh pr merge <PR> --auto --squash`, `agent-process wait_for_pr <PR>`, не больше трёх раундов
  правок по ревью.

## Scenario → test map

| Спек | Сценарий | Тест |
|---|---|---|
| tmdb-access | Тайтл, скрытый прокси Lampac, находится | `tests/live/tmdb-access.sh`, шаг `tmdb-unfiltered` (`find/tt33071426`) |
| tmdb-access | Адреса TMDB не ведут на прокси Lampac | `tests/live/tmdb-access.sh`, шаг `tmdb-unfiltered` (адреса `Lampa.TMDB.api`/`image`) |
