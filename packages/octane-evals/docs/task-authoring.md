# Task authoring

An eval task should measure one named capability and have an executable,
solution-independent correctness oracle. Prefer small real defects or carefully
constructed mutations over trivia and repository recall.

## Choose the task boundary

Record the suite (`tsrx`, `octane`, or `integration`), execution mode,
capability, difficulty, and a stable `familyId`. Integration tasks also name the
package under test. Related mutations, renamed variants, and tasks derived from
the same upstream issue or fixture share a family. Dataset splits happen by
family, never by individual row.

Capabilities are `authoring`, `migration`, `repair`, `semantic-parity`,
`api-integration`, `ssr-hydration`, and `divergence-recognition`. Difficulty is
`introductory`, `standard`, or `advanced`; it describes the expected work,
not the model success rate.

Keep target-neutral TSRX parsing, diagnostics, formatting, and AST properties in
the `tsrx` suite. Generated behavior belongs to `octane` or `integration`; do
not require different TSRX targets to emit byte-identical code unless that is an
explicit shared contract.

For port tasks, also record a `portShape` so materially different integrations
can be compared fairly:

- `core-adapter`: a small hook or rendering adapter over a reusable core.
- `stateful-binding`: subscriptions, contexts, stores, or async state.
- `dom-component`: focus, events, layout, portals, or accessibility behavior.
- `compiler-build`: transforms, exports, Vite, SSR bundles, or deployment.
- `router-hybrid`: large integrations combining a reusable core and a ported
  framework layer.

Use the narrowest grader that proves the behavior. Final HTML alone cannot see
node identity, focus, effect order, render counts, subscriptions, physical DOM
moves, layout, or animation; assert those properties directly or use a real
browser.

## Required task metadata

Each task record, together with its wave audit log, should identify:

- The task, family, suite, execution mode, capability, difficulty, and optional
  port shape and package name.
- The base repository commit, exact TSRX and upstream package versions, lockfile,
  and environment image digest. Record exact package versions in
  `environment.packageVersions`; ranges and mutable tags are rejected.
- Creation and publication dates, source issue or commit, authors, reviewers,
  and per-source SPDX license information. Keep review-only details in the audit
  log rather than adding undeclared manifest fields.
- Public setup and test commands, immutable grader and scoring-policy digests,
  the private test-bundle digest for held-out tasks, context mode, and execution
  budget.
- Paths candidates may modify and any intentional Octane divergence relevant to
  the task.

The task policy records wall time, CPU, memory, processes, disk, captured output,
turns, total tokens, and tool calls. `maxTotalTokens` means the cumulative
provider-reported input plus output tokens across all model calls. Every allowed
path must sit under a declared writable path.

Do not copy upstream code until its license and attribution requirements have
been recorded. The benchmark's own license does not relicense embedded code.

## Authoring workflow

1. Pin a clean base checkout and dependency graph.
2. Write a prompt that describes observable requirements without dictating the
   patch. State allowed paths, available context, and each public validation
   command's stable ID and command text.
3. Reproduce the intended failure on the untouched base while unrelated
   regression tests pass.
4. Write private tests against behavior, not implementation details.
5. Produce a gold patch and at least one independently written alternative.
6. Confirm both solutions pass the target and regression suites repeatedly.
7. Try plausible wrong and partial patches; strengthen the tests until each is
   rejected for the intended reason.
8. Run the task from the immutable evaluation image with network access removed.
9. Have two reviewers independently check clarity, scope, provenance, and test
   validity. Adjudicate disagreements before release.
10. Pilot several model families and inspect every success for reward hacking and
    every common failure for ambiguity or an overly narrow oracle.

## Audit checklist

A task is release-ready only when all answers are yes:

- Does the baseline fail only the intended target?
- Is the prompt solvable from the declared context without private knowledge?
- Do multiple valid implementations pass?
- Do realistic wrong implementations fail?
- Are repeated runs deterministic?
- Are production compilation and SSR/hydration included when relevant?
- Are browser-only properties tested in a browser?
- Is the task isolated from the network, secrets, and the answer-bearing Git
  history?
- Are source, license, attribution, dates, and version pins complete?
- Have two qualified reviewers approved it?
- Has the task family been kept wholly within one dataset split?

An LLM may help categorize failures or flag suspicious tasks, but it must not be
the headline correctness oracle. Use deterministic executable grading.

Before a run, freeze a run manifest that binds the canonical task-set digest to
the exact model revision and configuration, harness commit and image, prompt
artifacts, tool definitions and configuration, sampling options, limits, context,
and scoring policy. Prompt and tool artifacts can remain separate public files;
their SHA-256 digests make the identity unambiguous.
