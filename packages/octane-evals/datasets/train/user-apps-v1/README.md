# Octane user-apps v1

This is a public training corpus of thirty-five realistic requests to build or
repair small Octane applications. It evaluates framework usage from a
consumer's perspective—not changes to Octane's source repository.

Each directory under `tasks/` contains a prompt, an incomplete starter
`src/App.tsrx`, an observable behavior grader, and a passing reference
implementation. The generated `manifest.jsonl` binds every starter and grader
to immutable digests, exact package versions, the framework-base and effective
evaluation-overlay lockfiles, and the container image. The generated
`training.jsonl` exposes the same prompt, starter, and reference as
ready-to-ingest chat conversations.

## Coverage

The checked `catalog.json` coverage map binds each competency to executable
tasks. The corpus includes:

- component composition, hooks, native event handling, state updates, keyed
  templates, and the major TSRX control-flow directives;
- conditional hooks, inferred dependencies, current-state getters, controlled
  native input, deliberate text commit handling, class composition, ref
  props/multi-ref, and parallel `use()` as intentional React divergences;
- sibling-scoped `<style>` blocks across nested template and control-flow
  scopes, exported themes applied with `apply`, theme composition, and
  `$class`; and
- consumer applications using Zustand, Hook Form, i18next, and TanStack Query;
  and
- Strong mode repairs, described below.

```bash
# Verify every public reference answer.
bun run --filter @octanejs/evals test:user-apps

# Check that manifest digests still match task bytes.
bun run --filter @octanejs/evals corpus:check

# Prove every incomplete starter loads but fails its behavioral grader.
bun run --filter @octanejs/evals test:user-app-starters
```

## Strong mode repairs

The fourteen `octane.strong-*` tasks share the `octane.strong-repair` family and
the `repair` capability. Each starter opts into Strong mode with `"use strong"`
and fails to compile, and its prompt quotes the compiler's exact error. A
passing answer must do two things. It must compile in Strong mode, and the
grader compiles it with `strong: true`, so deleting the directive does not help.
It must also remove the bug that the diagnostic predicts, which the grader
checks with server-rendered HTML, prop updates, races, or cleanup.

Each task also records the workarounds agents reach for under
`negatives/<name>/src/App.tsrx`. Every workaround must fail its grader.
`strong-repair-negatives.json` records whether each one is already
`rejected-by-strong` or still `compiles-keeps-bug`. The second group is the
compiler's backlog of missing checks, and each entry is a candidate compiler
fixture.

Valid answers that differ from the reference live under
`alternatives/<name>/src/App.tsrx` and must pass, so a grader cannot quietly
reject a correct fix. Server checks run the server build in a separate realm
that has Node's server globals and no browser bindings. As on a real server,
`window` is undeclared and `globalThis.window` is `undefined`.

```bash
# Check prompts, starters, references, and every workaround, then refresh the ledger.
bun run --filter @octanejs/evals strong-repair:verify
```

Reference answers are deliberately public so this release can train models.
Exclude the entire `reference/` tree from candidate workspaces. Scores on this
release measure harness health and learned capability, not performance on unseen
tasks.
