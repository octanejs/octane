# Octane user-apps v1

This is a public training corpus of eighteen realistic requests to build small
Octane applications. It evaluates framework usage from a consumer's
perspective—not changes to Octane's source repository.

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
  native input, class composition, ref props/multi-ref, and parallel `use()` as
  intentional React divergences; and
- consumer applications using Zustand, Hook Form, i18next, and TanStack Query.

```bash
# Verify every public reference answer.
pnpm --filter @octanejs/evals test:user-apps

# Check that manifest digests still match task bytes.
pnpm --filter @octanejs/evals corpus:check

# Prove every incomplete starter loads but fails its behavioral grader.
pnpm --filter @octanejs/evals test:user-app-starters
```

Reference answers are deliberately public so this release can train models.
Exclude the entire `reference/` tree from candidate workspaces. Scores on this
release measure harness health and learned capability, not performance on unseen
tasks.
