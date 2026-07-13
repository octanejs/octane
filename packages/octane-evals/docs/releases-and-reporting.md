# Releases and reporting

## Evaluation lifecycle

An evaluation wave is an immutable task set, grader, environment image, and
scoring policy. Each submitted system also has a run manifest binding that wave
to a model, harness, prompts, tools, sampling configuration, budgets, context,
and execution mode. Name waves by date, such as `2026.09`, and publish their
digests before accepting comparable submissions.

1. Author and audit candidate tasks privately.
2. Freeze the wave and its container, dependency lockfile, budgets, and grader.
3. Evaluate submitted predictions in fresh isolated sandboxes.
4. Publish aggregate and per-task results, harness metadata, and declared
   exclusions without revealing active private artifacts.
5. Retire the wave when exposure or age weakens its signal.
6. After an embargo, publish cleared prompts, tests, gold and alternative
   solutions, and audit notes as a versioned training release.
7. Replace retired tasks with new families. Never promote public material back
   into a held-out set.

Changing a task, image, hidden test, budget, or scoring rule creates a new wave.
Historical manifests and reports remain available so results can be reproduced.

## Context and execution modes

Use one context mode throughout a comparable run and record it in both the task
set and run manifest:

- `repo-docs`: frozen checkout plus the documentation at the pinned
  commit. This is the default for a fast-moving alpha project.
- `repo-docs-mcp`: the same context plus a pinned Octane MCP server and
  declared tool set.
- `closed-book`: prompt-only recall, reported separately from open-book runs.

Also separate direct completion, instruction-to-patch, and agentic repository
repair. The collection validator rejects mixed benchmark versions, splits,
contexts, or execution modes. A score belongs to the full evaluated system:
model revision, system and user prompts, harness commit and image, context,
tools, sampling settings, attempt policy, token budget, wall-clock limit, and
cost.

## Scoring

Use strict task resolution as the headline measure:

- Report `pass@1` for one-shot completion or patch generation.
- Report resolved-task rate for agents under one declared attempt and budget.
- Macro-average by suite and capability; for integration tasks, also
  macro-average by port shape and package.
- Include descriptive Wilson 95% confidence intervals and per-task outcomes with
  sanitized command-level results. Related variants are clustered by `familyId`,
  so disclose that the task-level interval assumes independence and can be too
  narrow; use a family-cluster analysis for inferential comparisons.

Compile rate, target-test rate, regression rate, tokens, time, and cost are useful
diagnostics, not substitutes for resolution. Schema `1.0` is explicitly pass@1
and rejects any other attempt count. Add pass@k only in a future schema that
defines independent sampling and the estimator used.

Preserve each result with its matching prediction, run manifest, and immutable
task manifest. Results carry the run, task-set, attempt, prediction, grader, and
environment identities plus resolved status, command outcomes, duration, and
resource usage. The reporter rejects stale or foreign records. Redact secrets
and private test output before publishing them.

## Provenance and contamination

Every task carries source repositories and commits, creation and publication
dates, upstream versions, authorship, SPDX identifiers, attribution, and its
family lineage. Keep near-duplicates, translations, and generated variants in
the same split. Stronger transfer studies should hold out entire packages or
subsystems.

Search known training corpora and public code for task text and distinctive
fixtures where possible. Contamination checks are evidence, not proof: disclose
their method and date. A leaked task is retired rather than silently edited.

## Sandbox boundary

Candidate code is untrusted. Never run submissions directly on a maintainer
machine or in a checkout containing credentials or private tests.

Run every attempt in a fresh ephemeral sandbox with:

- No network, cloud metadata endpoint, credentials, or host sockets.
- A non-root user, read-only base filesystem, and a writable task workspace.
- CPU, memory, process, disk, output, and wall-clock limits.
- A repository snapshot without answer-bearing branches, refs, reflogs, build
  caches, or Git objects.
- Hidden tests injected only into a separate grader phase and removed afterward.
- An allowlisted command surface and captured, size-limited logs.

Containers are packaging, not automatically a security boundary. The production
grader should use an isolation technology appropriate for hostile code and keep
the orchestration control plane outside the candidate environment.

Use `max-turns`, `max-tokens`, `max-tool-calls`, or `timeout` when those explicit
run budgets stop generation. Use `sandbox-limit` when process, disk, memory, or
captured-output enforcement terminates the attempt; `tool-error` is reserved for
an actual tool failure.
