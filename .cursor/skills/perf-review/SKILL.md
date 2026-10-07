---
name: perf-review
description: Check that a diff, branch, or PR keeps Octane hot paths fast - stable V8 shapes and monomorphic sites, DOM work without forced layout, no new microtask hops or ad-hoc task posters - and that it carries the evidence each risk needs. Use before readying a PR that touches packages/octane/src, compiler output, or binding hot paths, or when reviewing agent-written code.
---
# Skill: Perf review

Use this to verify that a change applied the hot-path discipline in
`performance-audit`, which you load alongside this skill. Its references hold
the rules and the runtime code that already follows them:
[V8 shapes](../performance-audit/references/v8-shapes.md),
[DOM work](../performance-audit/references/dom-work.md), and
[scheduling](../performance-audit/references/scheduling.md).

This is a validator. On someone else's PR, report findings and do not push fixes
unless asked. On your own diff before handoff, fix every `must-fix` finding and
run the review again.

## 1. Choose the target

```bash
node scripts/perf-review-scan.mjs                         # your worktree against its merge-base with origin/main
node scripts/perf-review-scan.mjs --head <branch>         # a branch's committed diff
gh pr diff <number> --repo octanejs/octane | node scripts/perf-review-scan.mjs --diff -
node scripts/perf-review-scan.mjs packages/<binding>/src/ # a binding's hot path
```

- The default scope is shipped runtime source under `packages/octane/src`,
  excluding `compiler/`. Path prefixes replace that scope; tests, fixtures, and
  benchmarks are always excluded. `--json` prints machine-readable findings.
- `gh pr diff` carries only three lines of context, so the loop and
  read-after-write notes see less. A pasted diff also lacks the head's
  `runtime.ts`, so `--diff` skips `hot-class-shape`. For a full review, check
  out the PR head in a worktree and use `--head`.

## 2. Classify the change before judging it

For each changed function, find its callers and decide how often it runs:

- **Hot:** per render, node, item, event, signal notification, or server
  request. Framework fundamentals count as hot until the call graph shows
  otherwise (`.rulesync/rules/core-engineering.md`).
- **Cold:** module initialization, once per root, error and abort paths, and
  development-only branches. A development-only branch must still not change a
  production shape.

Then note which dimensions apply: shapes and allocation, reachability, DOM,
scheduling, and compiler output.

## 3. Read the mechanical candidates

The scan reports candidates on added lines with comments and strings blanked.
Every candidate must end up as a finding or as a dismissal with a reason.

| Rule | Catches | Typical dismissal |
| --- | --- | --- |
| `hot-class-shape` | A `BlockImpl`, `ScopeImpl`, or `LiteBlockImpl` field that is a runtime class field, never assigned in the constructor, assigned conditionally, or assigned without a declaration | None. Holds on main; fix it |
| `hot-field-write` | A write through a Block or Scope receiver, cast or not, to a field those classes do not declare | None. Holds on main; declare and initialize it |
| `delete-operator` | `delete` on an object | Intentional dictionary or cold path |
| `conditional-shape` | `...(cond ? {…} : {…})` or `...(cond && {…})` | Cold options object |
| `shape-mutation` | `Object.freeze`, `defineProperty`, `setPrototypeOf` outside module-scope constants | Once per template or module, or a pinned exemplar |
| `holey-array` | `new Array(n)` without `.fill` | Never indexed out of order and cold |
| `rest-or-arguments` | A rest parameter or `arguments` | Cold branch, as in the HMR `wrapper` |
| `layout-read` | Geometry reads, noting a DOM write earlier in the hunk | Batched measure phase, or a layout effect that reads before writing |
| `microtask-hop` | `queueMicrotask`, `Promise.resolve().then`, noting an enclosing loop | One hop per burst that does no framework work per value |
| `await-as-yield` | `await` of a settled value | Not used to yield |
| `schedule-render` | A new `scheduleRender` call, noting an enclosing loop | Called once per burst, not per item or value |
| `animation-frame` | `requestAnimationFrame` | Visual work meant to land before paint, with a timer fallback |
| `task-poster` | `MessageChannel`, `setTimeout(…, 0)` or without a delay, `setImmediate`, `postTask`, `requestIdleCallback` | Extends an existing poster |

The scan cannot see the following, so check them by hand:

- **Compiled output.** Compile a representative fixture from
  `packages/octane/tests/_fixtures/` before and after through the public
  compiler. Diff it for per-render closures, literals whose keys vary, extra
  runtime calls per node, changed `bagN` arity, and new runtime imports.
- **Reachability.** A new reference from a hot or compiled path to a large
  function or driver, a new import into `runtime.ts`, or a `hydrating` guard
  that does not fold.
- **Polymorphism and representation.** A hot function that now receives a new
  receiver shape or argument type, returns a different shape, or stores a new
  type in an existing field, such as a double in a Smi field or `undefined` in a
  numeric one.
- **Allocation.** Closures, literals, spreads, `Array.from`, or iterators created
  per item or per render.
- **DOM across functions.** A read after a write that sits in a different
  function or hunk, and new per-element listeners or per-node DOM creation where
  a template clone would do.
- **Scheduling semantics.** An existing render request moved into a loop or a
  producer, more frequent `drainPassivesBeforeRender`, or a change to the
  contract in `docs/differences-from-react.md` §Scheduler.

## 4. Judge each dimension

Answer these from the code. Cite file:line for every answer.

- **Shapes:** Is every new field on a hot record initialized at every
  allocation site, with identical keys and order across literal sites? Does any
  hot function gain a receiver map, argument type, or return shape?
- **Allocation:** What does the change allocate per render or per item? Can it
  be hoisted, reused, or replaced with an intrusive list?
- **DOM:** Are reads batched before writes, and outside the render walk? Is each
  built subtree inserted once? Do resize callbacks that write go through
  `createResizeObserver`?
- **Scheduling:** Can any producer now render or commit per value or hop? Does a
  new microtask chain do framework work at each step? Does a new task poster
  duplicate `schedulePostPaint`, `actCheckpoint`, `createResizeObserver`'s
  poster, or `resumeOnSettle`, and does it survive hidden tabs and `act()`?
  Does the change alter the documented contract without a decision from #1864?
- **React divergences:** Is anything you would flag a documented divergence in
  `docs/differences-from-react.md`? Those are not defects. When a trade-off is
  ambiguous, prefer React semantics.

## 5. Require evidence

Each finding names the evidence it needs, from the table in `performance-audit`:
a one-map `%HaveSameMap` probe, allocation per call with pinned semi-space,
deterministic work counters, bundle rows from the CI report, the marker-task
commit count, or Event Timing in Chromium. Mark whether the PR provides it.

Run only the owning suite or a scratch probe locally, one at a time. Leave the
full `pnpm test`, benchmark sweeps, and browser suites to CI.

## Report

```md
## Perf review: <PR, branch, or worktree> (<base>..<head>)

Scan: `node scripts/perf-review-scan.mjs <args>` → <N> candidates.
Hot paths touched: <functions, with their frequency>.

| # | Severity | Location | Dimension | Finding | Required evidence | Provided? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | must-fix | packages/octane/src/runtime.ts:1234 | shapes | … | `%HaveSameMap` across modes | no |

Dismissed candidates:
- `packages/octane/src/runtime.ts:4567` [microtask-hop]: error-report path, once per uncaught error.

Not checked: <for example, browser latency, because no Chromium run>.
```

- **must-fix:** breaks a rule on a hot path, or fails `hot-class-shape` or
  `hot-field-write`.
- **needs-evidence:** may be fine, but the claim or the risk needs the listed
  measurement before the PR is ready.
- **note:** a cold-path observation or a follow-up.

A finding without a file:line and an argument for why the path is hot is not a
finding. When `create-a-pr` invokes this skill, paste the report into the PR
body's validation section.
