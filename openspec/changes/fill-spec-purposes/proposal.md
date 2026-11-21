## Why

`openspec validate --strict --all` на `origin/main` (`35c213f`, 2026-11-21): `Totals: 7 passed, 3 failed
(10 items)`. Красные `card-buttons`, `kp-main-recommendations`, `tmdb-access`. Каждая сообщает:

> [WARNING] overview: Purpose section is still a placeholder rather than a Purpose anyone wrote (the
> sentence `openspec archive` writes for a new capability, ...). Replace it with what this capability
> is for, editing the main spec directly: a `## Purpose` in a delta is read only when the capability
> is created, so it cannot replace this one.

В каждой из трёх под `## Purpose` стоит строка `TBD - created by archiving change <change>. Update
Purpose after archive.`. Её записал `openspec archive` при создании capability в changes
`torrents-button` (#71), `disable-lampac-tmdb-proxy` (#74) и `kp-main-recommendations` (#82). Шаг
«дописать Purpose после архива» никто не сделал, а CI основные спеки в `--strict` не проверяет.
Поэтому заглушки дошли до main.

Без Purpose читатель спеки не видит, зачем нужна capability. Кроме того, `--strict --all` в задаче
Verify каждого change краснеет из-за чужих спек, и это приходится объяснять в каждом PR, как в #87.

## What Changes

- В `openspec/specs/card-buttons/spec.md`, `openspec/specs/tmdb-access/spec.md` и
  `openspec/specs/kp-main-recommendations/spec.md` строка-заглушка под `## Purpose` заменяется одним
  предложением о назначении capability. Текст берётся из Why архивного proposal и из требований спеки.
- Требования и сценарии не меняются.

Вне рамок: проверка, которая ловила бы заглушку автоматически. Пробел общий для процесса, поэтому
он заведён в плагине: ekolvah/agent-process-distribution#525.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет: `skip_specs: true`. Требования не меняются. Purpose через дельту не заменить, валидатор велит
править основную спеку напрямую (цитата выше).

## Standard approach

none found: внешних руководств с URL не искал сверх инструментов OpenSpec. Просмотрены сообщение
валидатора OpenSpec 1.13.0 (цитата в Why) и скилл `openspec-sync-specs` плагина agent-process 3.34.1
(`.claude/skills/openspec-sync-specs/SKILL.md:147`: «Add Purpose section: copy the delta's
`## Purpose` body verbatim when it has one»). Оба источника согласны: после архива Purpose
дописывают в основной спеке, а предотвратить заглушку можно, если дать `## Purpose` в дельте новой
capability. В репозитории так уже заполнены `card-torrent-filter`, `kp-card-trailers`,
`kp-history-recommendations`, `now-watching-new-releases` и `trailer-search-service`.

## Impact

- Правятся: `openspec/specs/card-buttons/spec.md`, `openspec/specs/tmdb-access/spec.md`,
  `openspec/specs/kp-main-recommendations/spec.md`, в каждом одна строка под `## Purpose`.
- Добавляются и удаляются: нет.
- Только документация. Код, плагины и конфигурация на приставке не меняются.
