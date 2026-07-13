# @octanejs/evals

Reproducible evaluation tooling and public benchmark material for Octane, TSRX,
and the `@octanejs/*` integrations.

This workspace package is private to prevent accidental npm publication. That
does **not** make its contents secret: every committed file should be treated as
public and potentially present in model training data.

## What belongs here

- Task, run, prediction, and result schemas; validation; runners; and reports.
- Public development tasks used to exercise the harness.
- Retired evaluation waves released as training data.
- Documentation, task-authoring guidance, and reproducible baseline results.

Active held-out prompts, hidden tests, gold patches, private grader images,
credentials, and decryption keys must never be committed, even temporarily.
Keep them in access-controlled storage or a hosted grader. The public release
may contain immutable digests and metadata needed to identify those artifacts.
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

- `tsrx`: syntax, compiler diagnostics, transformations, formatting, and
  target-neutral language behavior.
- `octane`: components, hooks, reconciliation, events, Suspense, SSR, and
  hydration.
- `integration`: port behavior, API and type parity, intentional divergence
  recognition, and browser-dependent behavior.

Every task also records a capability and, for integration tasks, a port shape.
Reports provide a strict overall pass@1 rate plus macro-averaged suite,
capability, port-shape, and package breakdowns.

Execution modes are `completion`, `instruction`, and `agentic`; they are
reported separately because tool access and interaction change the claim a
score supports.

## Start here

- [Task authoring](./docs/task-authoring.md) explains how to create, audit, and
  review a task.
- [Releases and reporting](./docs/releases-and-reporting.md) defines evaluation
  waves, context modes, scoring, provenance, and isolation requirements.
- [`examples/`](./examples) contains a small public task and sample run,
  prediction, and result records.
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

Schema `1.0` deliberately supports pass@1 only: `attempt` is required and must
be `1`. A future pass@k protocol must version its independence and aggregation
contract instead of treating multiple predictions as interchangeable rows.

The benchmark is open-book by default: candidates receive a frozen repository
checkout and its documentation. Closed-book and MCP-assisted runs are distinct
context modes and must be reported separately.
