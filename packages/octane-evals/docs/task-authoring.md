# Task authoring

An eval task should measure one named capability and have an executable,
solution-independent correctness oracle. Start from a normal request to build a
small application or feature with Octane. The candidate edits a self-contained
starter workspace; it does not repair the Octane monorepo or change framework
internals.

## Choose the task boundary

Record the suite (`tsrx`, `octane`, or `integration`), execution mode,
capability, difficulty, and a stable `familyId`. Integration tasks also name the
package under test. Paraphrases, renamed variants, and tasks derived from the
same application behavior share a family. Dataset splits happen by family,
never by individual row.

Capabilities are `authoring`, `migration`, `api-integration`,
`ssr-hydration`, and `divergence-recognition`. Difficulty is `introductory`,
`standard`, or `advanced`; it describes the expected application work, not the
model success rate.

Use the `tsrx` suite for component authoring, template directives, native events,
hooks, and state-driven UI. Use `octane` for consumer-visible core behavior such
as context, Suspense, refs, SSR, and intentional React divergences. Use
`integration` when the application consumes an `@octanejs/*` package through
its public API.

Every release should cover ordinary component composition, event handling,
state ownership and updates, and hooks. Intentional React divergences are
first-class competencies: write focused tasks for native `onInput`, conditional
hooks, inferred hook dependencies, current-state getters, ref props,
class composition, and parallel `use()` when those behaviors are in scope.
Keyed templates are a separate core authoring pattern. Do not reward
React-compatible code that happens to compile but violates the Octane contract.

For port tasks, also record a `portShape` so materially different integrations
can be compared fairly:

- `core-adapter`: a small hook or rendering adapter over a reusable core.
- `stateful-binding`: subscriptions, contexts, stores, or async state.
- `dom-component`: focus, events, layout, portals, or accessibility behavior.
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
- The documentation/framework snapshot commit, exact TSRX and upstream package
  versions, lockfiles, and environment image digest. In schema 1.1,
  `environment.lockfileHash` identifies the lockfile at the framework
  `baseCommit`; set `environment.overlayLockfileHash` when the effective
  evaluation dependency graph adds a benchmark overlay. Record exact package
  versions in `environment.packageVersions`; ranges and mutable tags are
  rejected.
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

1. Pin a clean starter template, framework version, documentation snapshot, and
   dependency graph.
2. Write a prompt that describes observable application behavior without
   dictating the implementation. State allowed paths, available context, and
   each public validation command's stable ID and command text.
3. Confirm the incomplete starter compiles but fails the intended behavior.
4. Write deterministic graders against rendered output and user-observable
   behavior. Add a narrow parsed-AST source contract only when the task names an
   Octane syntax or API pattern that cannot be distinguished behaviorally (for
   example, an omitted dependency array or the third `useState` tuple member).
   Keep active held-out graders private; publish graders with training releases.
5. Produce a reference implementation and at least one independently written
   alternative.
6. Confirm both solutions pass the task repeatedly.
7. Try plausible React-shaped, wrong, and partial implementations; strengthen
   the tests until each is rejected for the intended reason.
8. Run the task from the immutable evaluation image with network access removed.
9. Have two reviewers independently check clarity, scope, provenance, and test
   validity. Adjudicate disagreements before release.
10. Pilot several model families and inspect every success for reward hacking and
    every common failure for ambiguity or an overly narrow oracle.

## Audit checklist

A held-out task is ready for comparable model scoring only when all answers are
yes. Public training exemplars may ship without private review evidence, but
must not be presented as uncontaminated benchmark results:

- Does the starter compile and fail only the intended behavior?
- Is the prompt solvable from the declared context without private knowledge?
- Do multiple valid implementations pass?
- Do realistic wrong implementations fail?
- Are repeated runs deterministic?
- Are production compilation and SSR/hydration included when relevant?
- Are browser-only properties tested in a browser?
- Is the task isolated from the network, secrets, and the public reference
  implementation?
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
