## Why

`openspec validate --strict --all` на `origin/main` (`cad433f`, 2026-11-27): `Totals: 11 passed, 1 failed
(12 items)`. Красная `favorites-across-sources`:

> [WARNING] overview: Purpose section is still a placeholder rather than a Purpose anyone wrote (...).
> Replace it with what this capability is for, editing the main spec directly: a `## Purpose` in a
> delta is read only when the capability is created, so it cannot replace this one.

Под `## Purpose` стоит `TBD - created by archiving change favorites-dedup-across-sources. Update Purpose
after archive.`

**Причина.** Дельта `favorites-across-sources` в change `favorites-dedup-across-sources` (#113) создавала
новую capability без `## Purpose`, и `openspec archive` записал заглушку. Задача Verify гоняет
`validate --strict --all` до архива, когда основной спеки ещё нет; после архива основные спеки не
проверяет ни `archive_change`, ни CI. Так заглушка дошла до main и всплыла только в Verify следующего
change (#119).

Это второй случай того же класса: первый закрыт в `fill-spec-purposes` (#88), а проверка, которая ловила
бы заглушку автоматически, отложена в плагин — ekolvah/agent-process-distribution#525, всё ещё открыт.
Capability, чья создающая дельта несла `## Purpose` (`kp-history-recommendations`, `edit-secret-hook`,
`kp-main-new-release-rows`, `card-season-badge`), заглушки не получили.

## What Changes

- В `openspec/specs/favorites-across-sources/spec.md` строка-заглушка под `## Purpose` заменяется одним
  предложением о назначении capability, по Why архивного proposal #113 и требованиям спеки.
- Требования и сценарии не меняются.

Вне рамок: автоматическая проверка заглушки — ekolvah/agent-process-distribution#525.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет: `skip_specs: true`. Purpose через дельту не заменить, валидатор велит править основную спеку
напрямую (цитата выше). Прецедент — `fill-spec-purposes`.

## Standard approach

none found: новых внешних источников не искал. Просмотрены сообщение валидатора OpenSpec 1.13.0
(цитата в Why: править основную спеку напрямую) и источники, уже разобранные в
`openspec/changes/archive/2026-11-21-fill-spec-purposes/proposal.md`; там принят тот же путь.

## Impact

- Правится: `openspec/specs/favorites-across-sources/spec.md`, одна строка под `## Purpose`.
- Добавляются и удаляются: нет.
- Только документация. Код, плагины и конфигурация на приставке не меняются.
