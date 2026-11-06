# agent-process:managed

# Agent process: always on

## Goal function

Every agent working in this repository optimises the same three goals, in this
strict order. They are the *why* behind §I–§VII: when two principles pull in
different directions, the higher goal decides.

1. **Minimize future bug-fixing and support.** Root cause before fix (§V),
   visibility over silence (§IV), test-first (§I).
2. **Optimize token spend**, both development and runtime. Simplicity first
   (§VII); before an expensive step — a subagent, a web search, a wide grep —
   weigh whether it pays for itself. Watch for work for work.
3. **Preserve predictability and user control.** One PR is one logical unit;
   risky or shared-state actions are confirmed with the user even when they are
   technically permitted. The procedural half of this goal lives in
   the `agent-process` skill.

### Scripts over instructions

A deterministic step of any multi-step workflow ("check X", "make sure Y",
"extract Z") becomes **a standard, maintained tool** where one does the job (§VII),
otherwise **a script with an exit code and unit tests** on its pure functions, not a line
of prose. Prohibitions become a deny-list, a hook, or branch protection — never "remember
not to do X". Trigger heuristic: the moment a rule is phrased as "must not forget about X",
X belongs in a script or a gate. When a tool causes friction, look first for the
architectural choice that causes it, not for a workaround script.

## Operative principles

- **§I** A behavioural change starts with a failing test: RED, code, GREEN. Exempt: renaming or
  moving a tested symbol, docs-only, a one-line non-behavioural fix.
- **§II** External services sit behind an injected `typing.Protocol`; tests use in-memory
  doubles, never mocks of internal logic.
- **§III** Owed output is never lost silently: a missed delivery logs ERROR, marks the result
  not-ok, exits non-zero; state records only confirmed delivery.
- **§IV** No swallowed error or fail-open branch: a degraded result carries a visible marker and
  a WARNING; a fatal error logs ERROR and exits non-zero.
- **§V** Reproduce and locate the failure before a change: instrument first, observe the live
  system when it is the subject. No workaround, shim, retry, broader catch or CI bypass until
  the cause is named or a documented mitigation links its issue.
- **§VI** Config is validated at load; a new class of config error gets its check in the same
  PR.
- **§VII** The minimum diff for the stated task, nothing speculative: touch only what it
  requires, match the surrounding style, refactor nothing adjacent. Ask before adding a
  dependency, package or build step.

## Claude harness

- Read narrowly: a search or an `offset`/`limit` read before a whole file. When the read-budget
  hook denies a `Read`, take the call it names; never route around it.
- When a question takes two or more lookups (reads, searches, `gh`, web) of material you will
  not edit, ask the `Explore` subagent for the conclusion with `path:line` references. Spawn
  other subagents only for independent work; do not redo work a subagent reports.
- Be concise by default, in replies and in files.
- Wait for a long command with one foreground call and a raised `timeout`, never a `sleep` or
  re-read loop.
- After a compaction between the RED commit and GREEN, recover from the branch
  (`git branch --show-current`), the RED commit and one `gh issue view <N>`; do not re-read
  what the RED commit records.
