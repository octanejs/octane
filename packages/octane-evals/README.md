# @octanejs/evals

Reproducible evaluation tooling and public benchmark material for Octane, TSRX,
and the `@octanejs/*` integrations.

This workspace package is private to prevent accidental npm publication. That
does **not** make its contents secret: every committed file should be treated as
public and potentially present in model training data.

## Included user-app training corpus

`datasets/train/user-apps-v1` contains nineteen executable application-authoring
tasks. They ask a model to write an Octane app from a normal user request; none
asks it to repair or modify the Octane monorepo.

| Area | Concrete coverage |
| --- | --- |
| TSRX patterns | Components, state, native events, controlled forms, `@if`, keyed `@for`/`@empty`, `@switch`, and `@try` |
| Composition and state | Parent/child composition, local versus lifted state, functional updates, reducers, context, and keyed identity |
| React divergences | Conditional hooks, inferred hook dependencies, current-state getters, native controlled input, deliberate text commit handling, ref props/multi-ref, class composition, and parallel `use()` |
| Core platform | Suspense/error handling, SSR, hydration, controlled inputs, and `useId` |
| Integrations | Zustand, Hook Form, i18next, and TanStack Query through their public `@octanejs/*` APIs |

Representative executable tasks include
[`octane.composed-team-board`](./datasets/train/user-apps-v1/tasks/octane.composed-team-board/prompt.md),
[`octane.native-change-intent`](./datasets/train/user-apps-v1/tasks/octane.native-change-intent/prompt.md),
[`octane.native-controlled-search`](./datasets/train/user-apps-v1/tasks/octane.native-controlled-search/prompt.md),
[`octane.state-getter`](./datasets/train/user-apps-v1/tasks/octane.state-getter/prompt.md),
[`octane.parallel-use-dashboard`](./datasets/train/user-apps-v1/tasks/octane.parallel-use-dashboard/prompt.md),
and
[`integration.hook-form-profile`](./datasets/train/user-apps-v1/tasks/integration.hook-form-profile/prompt.md).

Every task directory contains:

- `prompt.md`: the user request supplied to the model;
- `starter/src/App.tsrx`: the incomplete application workspace;
- `grader.test.ts`: executable, consumer-observable behavior checks; and
- `reference/src/App.tsrx`: the public target answer for training and corpus
  regression testing.

Run all nineteen reference answers with:

```bash
pnpm --filter @octanejs/evals test:user-apps
```

The generated [`training.jsonl`](./datasets/train/user-apps-v1/training.jsonl)
also publishes every prompt, starter, and reference implementation as a
three-message training conversation. The catalog's immutable coverage map and
the TSRX AST source contracts are checked by tests, so a required coding pattern
or React divergence cannot silently disappear or be satisfied by an unrelated
implementation.

The external sandbox host places the candidate's `src/App.tsrx` in an otherwise
empty submission directory, establishes isolation, injects
`OCTANE_EVAL_SANDBOX=1`, and then runs the manifest command:

```bash
pnpm --filter @octanejs/evals grade:user-app -- \
  --task tsrx.counter --submission /workspace/submission
```

The marker is a host-runner handshake, not a security boundary. Never set it
manually to run an untrusted submission on a workstation: this package does not
create a container or restrict network, credentials, processes, or filesystem
access. These committed tasks are public training examples and smoke tests, not
an uncontaminated benchmark. Comparable model scoring requires new families
whose prompts, tests, and references remain in the hosted grader until
retirement.

The stricter independent-solution and reviewer checklist in
[`docs/task-authoring.md`](./docs/task-authoring.md) applies before a held-out
family is used for comparable model scoring. This public corpus validates its
published references and starters automatically; it does not claim a private
review audit.

## Public/private boundary

- Task, run, prediction, and result schemas; validation; runners; and reports.
- Public application-authoring tasks used for training and harness development.
- Retired evaluation waves released as training data.
- Documentation, task-authoring guidance, and reproducible baseline results.

Active held-out prompts, hidden tests, reference implementations, private grader
images, credentials, and decryption keys must never be committed, even
temporarily. Keep them in access-controlled storage or a hosted grader. The
public release may contain immutable digests and metadata needed to identify
those artifacts.
The package `.gitignore` is only a guardrail; it is not a confidentiality
boundary and cannot undo a leak into Git history.

Canonical task data is newline-delimited JSON. Public train and development
manifests must pass `parsePublicTaskManifestJsonl()`, which rejects the active
held-out `test` split. Embargo-cleared historical test manifests retain that
split and use `parseRetiredTaskManifestJsonl()` under `datasets/retired/` so
their original digest remains reproducible. Private graders may use the general
`parseTaskManifestJsonl()` API without putting the input file in this repository.

## Benchmark layers

| Layer | Purpose | Contents |
| --- | --- | --- |
| Train | Model training and analysis | Public prompts, tests, solutions, traces, and explanations |
| Dev | Harness and prompt development | Public tasks, tests, and expected grading behavior |
| Held-out | Comparable evaluation | Fresh tasks and private tests available only to the grader |

Tasks move in one direction: held-out to retired, then optionally to train.
Published train and dev material never moves back into a held-out wave.

## Suites

- `tsrx`: user-authored components exercising TSRX syntax, control flow, hooks,
  and native events.
- `octane`: user applications built with core APIs such as context, `use()`,
  Suspense, SSR, and hydration.
- `integration`: applications consuming `@octanejs/*` packages through their
  public APIs.

Every task also records a capability and, for integration tasks, a port shape.
Reports provide a strict overall pass@1 rate plus macro-averaged suite,
capability, port-shape, and package breakdowns.

Execution modes are `completion`, `instruction`, and `agentic`; they are
reported separately because tool access and interaction change the claim a
score supports.

## Start here

- [The user-apps-v1 corpus](./datasets/train/user-apps-v1) is the concrete
  prompt/starter/grader/reference dataset.
- [Task authoring](./docs/task-authoring.md) explains how to create, audit, and
  review a task.
- [Releases and reporting](./docs/releases-and-reporting.md) defines evaluation
  waves, context modes, scoring, provenance, and isolation requirements.
- [`datasets/`](./datasets) defines the layout for versioned public development
  tasks and retired training releases.

## Programmatic API

The package exposes strict parsers for manifests, predictions, and results,
plus JSONL helpers, deterministic reporting, and a provider-neutral runner:

```ts
import {
	createEvaluationReport,
	parsePredictionJsonl,
	parsePublicTaskManifestJsonl,
	parseRunManifestJsonl,
	runEvaluation,
} from '@octanejs/evals';
```

`runEvaluation(run, tasks, predictions, grader)` validates one immutable run,
matches exactly one prediction to each task, and calls a grader supplied by the
host. Its `acceptedPredictions` field is the canonical valid subset to pass to
`createEvaluationReport(run, tasks, acceptedPredictions, results)`, while invalid
submission rows remain explicit runner diagnostics and their tasks stay
unresolved. Reporting verifies every prediction digest and rejects records from
a stale grader, environment, task set, or run. Neither function spawns a shell
or executes candidate code; production hosts must inject a grader backed by the
isolation boundary described below.

Schema `1.1` is current. It adds immutable starter and public training-artifact
metadata, a distinct evaluation-overlay lockfile digest, and the
`framework-docs` context names used by standalone application tasks. The
parsers retain strict read compatibility with schema `1.0`: legacy rows use
`repo-docs` context names and cannot contain the 1.1-only fields.

Both supported schemas deliberately define pass@1 only: `attempt` is required
and must be `1`. A future pass@k protocol must version its independence and
aggregation contract instead of treating multiple predictions as
interchangeable rows.

The benchmark is open-book by default: candidates receive the frozen starter
workspace and version-pinned framework documentation. Closed-book and
MCP-assisted runs are distinct context modes and must be reported separately.
