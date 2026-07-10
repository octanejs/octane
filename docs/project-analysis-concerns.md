# Project analysis concerns

Status: source-backed audit snapshot from 2026-07-09 at `d3cf678`. This is a
risk register, not a claim that every item is a confirmed bug. Re-check the
owning source before acting because Octane is moving quickly.

The repository is unusually good at preserving design reasoning in source
comments and parity tests. The main concern is not a lack of documentation; it
is that several generations of otherwise-useful documentation now coexist and
contradict the live implementation.

## Priority summary

1. Sandbox the website playground before treating hash links as safely
   shareable.
2. Repair user/agent documentation drift from the live source, starting with
   RuleSync's source file rather than its generated targets.
3. Keep the five active conformance failures visible as an explicit parity-gap
   index, with hydration and effect teardown first.
4. Remove or guard duplicated compiler/runtime truth tables and repeated
   hook-slot exclusion lists.
5. Make the production website build tests incapable of writing the same
   output directories concurrently.
6. Calibrate ecosystem claims package-by-package; the bindings do not all have
   the same degree of parity.

## 1. Same-origin playground code execution

Severity: high for a public site with shareable playground links.

[`website/src/pages/Playground.tsrx`](../website/src/pages/Playground.tsrx)
decodes source from `location.hash` and automatically compiles and runs it after
the editor boots. [`website/src/lib/playground.ts`](../website/src/lib/playground.ts)
executes the result as a blob module in the website's page. Restricting static
imports to `octane` is useful for module resolution, but it is not a security
boundary:

- arbitrary top-level JavaScript is preserved and runs before a component is
  selected;
- the module can access `window`, `document`, same-origin storage, and any
  non-HttpOnly same-origin data available to the page;
- it can issue network requests or dynamically construct other behavior without
  a static `from '…'` clause;
- the `ErrorBoundary` only contains render-time component errors; it cannot undo
  top-level side effects;
- because hash payloads auto-run, opening an untrusted shared playground URL is
  enough to execute the payload.

The source-length limit protects responsiveness, not authority. The preview
should run in a sandboxed iframe with an opaque origin and a narrow
`postMessage` protocol. Ideally compilation also runs in a worker, while the
preview iframe receives only compiled code and has a restrictive CSP. At a
minimum, shared hashes should not execute until the visitor explicitly opts in.

Related robustness concern: Shiki re-tokenizes the entire document after each
change. The 20,000-character cap bounds this, but a worker would also keep
pathological parser/highlighter work off the main website thread.

## 2. Source-of-truth drift

Severity: high for contributor and agent correctness; low runtime risk.

The current workspace contains 17 publishable package manifests and 19 Vitest
projects. Several prominent sources still describe the older ten-package/eight-
binding repository:

- [`README.md`](../README.md) says there are ten publishable packages and lists
  only the original eight bindings.
- [`.rulesync/rules/project.md`](../.rulesync/rules/project.md), and therefore
  generated [`AGENTS.md`](../AGENTS.md), carry the same package map.
- [`.ai/project-map.md`](../.ai/project-map.md) uses the old binding names and
  contains obsolete runtime invariants.
- [`packages/octane-mcp-server/README.md`](../packages/octane-mcp-server/README.md)
  and the MCP server's known-binding map expose only the older set.

Behavioral contradictions are more dangerous:

- [`docs/differences-from-react.md`](differences-from-react.md) says hooks may
  be used "in a loop". The compiler now rejects slot-keyed hooks in plain JS
  loops; only `use()` and `useContext` are exempt. A keyed template `@for` or an
  extracted component is the supported per-item scope.
- [`packages/testing-library/README.md`](../packages/testing-library/README.md)
  says there are no controlled components and that `value` is a plain
  attribute. The current runtime implements React-style controlled
  `value`/`checked` restoration over native events.
- [`docs/radix-migration-plan.md`](radix-migration-plan.md) retains the same
  pre-controlled-forms premise in historical planning text.
- the RuleSync guide still describes the old `render() -> { head, body, css }`
  SSR surface. The current public split is `renderToString` /
  `renderToStaticMarkup` / streaming under `octane/server` and `prerender`
  under `octane/static`, with buffered results shaped as `{ html, css }`.
- historical plans and examples contain other superseded API descriptions.
  They are useful execution records, but their status is not always obvious at
  the paragraph where a reader lands.

Recommended correction strategy:

1. Fix [`.rulesync/rules/project.md`](../.rulesync/rules/project.md), then run
   `pnpm rules:generate`; do not edit generated agent files directly.
2. Make the root package inventory derive from workspace manifests, or add a
   small checked assertion that fails when the documented package set differs.
3. Give historical plans a conspicuous "historical record" banner and link to
   the current contract.
4. Generate the MCP binding list from package metadata instead of maintaining a
   second manual allowlist.
5. Add `pnpm rules:check` to CI. It exists as a script but the current CI runs
   tests, formatting, and typechecking only. The root `prepare` script also
   swallows RuleSync failure with `|| true`, so CI is the right place for a hard
   check.

## 3. Active React-parity gaps

Severity: mixed. These are confirmed and pinned by five real `it.fails` cases
under `packages/octane/tests/conformance/`.

### Hydration marker topology

Nested `{children}` component hierarchies render correct elements and text but
do not hydrate byte-stably. The server collapses a children-function block and
nested component into one marker range while the client expects layered
`childSlot` and `componentSlot` ranges, then mints fresh markers. See
[`ssr-serialization.test.ts`](../packages/octane/tests/conformance/ssr-serialization.test.ts).

This belongs near the top of the parity backlog because marker ownership also
affects teardown, movement, Suspense, and the proposed M3 marker-elision work.
It should be resolved as part of one coherent range-borrowing design, not by
loosening the byte-stability assertion.

### Effect teardown and update choreography

Two failures in
[`insertion-effect-order.test.ts`](../packages/octane/tests/conformance/insertion-effect-order.test.ts)
show that Octane's phase-wide effect queues differ observably from React's
per-fiber mutation walk:

- unmount currently unwinds one cleanup list synchronously in reverse
  registration order, including passive cleanups;
- insertion/layout cleanup and creation order across sibling components differs
  on update.

This is easy to miss with final-DOM tests and matters to CSS-in-JS, measurement,
subscriptions, and libraries that coordinate insertion and layout work.

### SSR render-phase state updates

[`ssr-server-semantics.test.ts`](../packages/octane/tests/conformance/ssr-server-semantics.test.ts)
pins that server `useState`/`useReducer` dispatches are inert. React replays
render-phase updates until they settle. Implementing parity requires a bounded
server render-phase loop without corrupting frame keys, `useId`, Suspense seed
order, or discovery jobs.

### Manual form transition status

[`form-actions-extra.test.ts`](../packages/octane/tests/conformance/form-actions-extra.test.ts)
pins that `useFormStatus` is activated only by Octane's intercepted
`<form action={fn}>` path. React also activates it when a prevented submit
handler starts a transition. The fix needs form-scoped submit/transition
tracking; the current process-global async-transition window is not enough.

The repository has many more `// GAP` comments than active `it.fails` calls.
Some are historical notes, partial cases, or intentional platform differences.
Maintaining a generated index of executable `it.fails` cases would keep the
real parity backlog separate from commentary that no longer represents a
failing behavior.

## 4. Differential tests intentionally cannot see several regressions

Severity: medium; well understood, but easy to forget when calling the rig the
"gold standard."

The differential rig normalizes or removes:

- Octane comment markers;
- inter-tag whitespace;
- generated IDs and Recharts counter IDs;
- attribute order;
- empty inline-style residue.

It compares final `innerHTML`, so it also cannot observe:

- survivor node identity or the physical move set;
- focus, selection, scroll position, or form-control live properties;
- effect/ref timing and cleanup order;
- event listener phase/order when final markup is unchanged;
- intermediate Suspense/transition states unless a test explicitly samples
  them.

Dedicated conformance, identity, marker-shape, focus, and hydration tests cover
many of these axes, but the coverage model is distributed. A short matrix in
the testing guide should state which suite owns each observable so a new feature
does not receive only a final-HTML differential test.

The real-browser website suite covers `/`, `/docs`, `/benchmarks`, and
`/playground` in dev and production. It does not replace the Hacker News or
Lexical example E2E suites, and those examples are not part of root `pnpm test`.
That is reasonable for cost, but they should be scheduled or manually gated
before releases that touch router/query/stylex/lexical integration.

## 5. Compiler/runtime duplicated invariants

Severity: medium-to-high because drift commonly appears as client/SSR/hydration
disagreement.

Source comments explicitly identify tables duplicated between
`compiler/compile.js`, `constants.ts`, and the runtimes, including:

- boolean and must-use-property attributes;
- attribute aliases;
- SVG-only tag classification and namespace rules;
- style unit coercion;
- void-element and controlled-form routing behavior.

The compiler needs data at build time and the runtime needs it at execution
time, but hand-maintaining copies is risky. A generated module, shared data
source, or build-time parity assertion would preserve fast local lookups without
making comments the only synchronization mechanism. Tests should compare the
tables directly, not only representative behavior.

**Resolved (2026-07-10):** the tables now live in one shared plain-JS module,
`packages/octane/src/dom-tables.js` (plain JS so the verbatim-shipped compiler
can import it directly; `constants.ts` re-exports with type annotations for the
runtimes and the public `octane/constants` surface). Covers the boolean/
must-use-property sets, attribute aliases, SVG-only tags, unitless style props,
void elements (previously triplicated with no central copy), style-value
coercion, and style-key hyphenation. Lookup shapes are unchanged — the same
`Set`/`Map` instances, imported instead of copied. The member-level audit found
zero drift in the data tables and ONE behavioral drift in the wrapped logic:
the compiler's private `cssStyleValueStatic` didn't trim string style values
while the runtimes' `cssStyleValue` does; static bakes now use the shared
function. `tests/dom-tables.test.ts` pins the wiring itself (re-export
identity, a mutate-the-shared-Set compiler probe, and per-category bake
assertions). Controlled-form routing remains split logic (compile.js
`controlledKindFor` vs per-kind runtime helpers) — it is behavior, not a
table, and stays covered by the controlled-form suites.

The compiler-emitted/runtime helper ABI is also broad. It includes template and
slot helpers, binding-bag arity factories, form bindings, control-flow blocks,
parallel-`use()` helpers, HMR, and binding infrastructure. Because
`@octanejs/*` packages consume parts of this semi-public tier, independently
versioned packages can accidentally rely on a helper added in a newer `octane`
release. While everything is `0.x`, either pin compatible Octane ranges tightly
or add a small ABI/version assertion that fails with an actionable message.

## 6. Hook-slotting configuration is powerful but fragile

Severity: medium; a previous production-only slot regression already proved
the failure mode.

`.tsrx`/`.tsx` files use the full compiler, while plain `.ts`/`.js` files use a
surgical hook-slot insertion pass. Hand-slot-forwarding binding sources must be
excluded to avoid double-slotting. Those path lists are repeated across many
Vitest projects and the website Vite config.

Risks:

- a new binding or source alias can work in its own project but be double-
  slotted when imported by another project;
- an exclusion can be present in tests but absent in the website or an example;
- production uses short described `Symbol()` slots while dev HMR uses
  `Symbol.for()`, so serve-mode coverage alone is insufficient;
- symbol descriptions are load-bearing because custom-hook paths compose them.

The `octane-prod` project is an excellent regression layer. The remaining
improvement is to make hand-slot-forwarding self-declarative (package metadata,
a source pragma, or a plugin option exported by the binding) and consume one
shared exclusion definition in tests, website, examples, and builds.

## 7. Marker protocol remains a major complexity center

Severity: medium; current work is measured and well tested.

M0-M2 of [`comment-marker-elision-plan.md`](comment-marker-elision-plan.md) are
landed. M2 substantially reduced de-opt chart markers, but SSR/client symmetry
and sole-child wrapper chains remain for M3. Markers are not decorative: they
own teardown ranges, list moves, Suspense detach/reveal, Activity hiding,
portals, streaming swaps, and hydration cursor alignment.

The main concern is change coupling. An optimization that is correct for a
fresh client mount can still break server emission, adoption, transition WIP,
or mismatch recovery. Keep the exact marker-shape pins and browser comment
ceilings as deliberate contracts. M3 should land atomically across client
compiler, server compiler, runtime ownership, and hydration tests.

The current target of reducing the home page below roughly 400 comments should
not turn into a requirement to remove load-bearing Suspense/portal/Activity
ranges. DOM weight is subordinate to ownership correctness.

## 8. Parallel `use()` changes evaluation timing

Severity: medium; intentional, documented, and performance-positive.

The default-on pipeline memoizes promise creation, hoists independent starts,
batches a stratum, and speculatively warms descendants. The local benchmark
shows the intended result: a ten-level async tree resolves around one latency
unit instead of React's serial waterfall.

The semantic cost deserves continued emphasis:

- independent render expressions may start earlier than their source order
  would under React;
- a warm plan can start work for a child that never commits;
- speculative work is swallowed on error and currently has no general
  cancellation/AbortSignal contract;
- proof mistakes are more serious than missed optimizations, so conservative
  cuts must remain the default;
- hydration seed and rejection observation order must stay textual even when
  creation order changes.

Keep `parallelUse: false` tested as a stable escape hatch. Add cancellation only
as an explicit API design, not as an implicit assumption that arbitrary promise
creations are abortable.

## 9. Client runtime global coordination has known edge conditions

Severity: medium-to-low, but important for future concurrency claims.

The scheduler is deliberately synchronous and has two priorities rather than
React lanes/time-slicing. That keeps many concurrent-interleaving problems out
of scope. Two global mechanisms still deserve caution:

- the async transition counter remains elevated across awaited transition
  actions, so an unrelated update during that process-global window may be
  tagged as transition work;
- held Suspense boundaries and staged reveals coordinate globally to emulate
  atomic transition reveals.

These are documented implementation choices, not hidden bugs. Avoid expanding
claims toward per-action isolation or true concurrent scheduling without an
AsyncContext-like design and new multi-root tests.

## 10. Metaframework and website build races

Severity: medium operational risk.

The production pipeline intentionally runs two builds and writes shared output:
`dist/client`, `dist/server`, and adapter output under `.vercel/output`.
`website/tests/ssr-smoke.test.ts` performs a real production build, while
`website/tests/ssr-hydration.e2e.test.ts` also performs a production build and
boots `octane-preview`. Vitest has no repository-level `fileParallelism: false`
setting for the website project.

If those files overlap, they can remove, rewrite, or import the same build
artifacts concurrently. The tests may currently serialize by timing rather than
contract. Confirm with a stress run, then either:

- build once in a website-project global setup and share the immutable result;
- allocate a unique output root per test worker; or
- explicitly serialize the build-owning files.

There are also several manual graph constraints: SSR aliases bare `octane` to
`octane/server` for raw binding sources, `ssr.noExternal` must include workspace
packages, `optimizeDeps` lists dynamically discovered dependencies, and plugin
exclusions must match hand-slot-forwarding sources. The website tests are the
right seam test, but the configuration should be treated as one coupled unit.

The server router cache in `website/src/app/router-server.ts` is sound only
because the current routes have no per-request loaders or user data. That
precondition is documented but unenforced. Adding authenticated or request-
specific loaders without changing the cache would risk cross-request state
reuse. Prefer a cache of immutable route definitions, not loaded router
instances, once the site gains request data.

The client pre-hydration hook polls for matches for at most 50 zero-delay timer
turns and then returns silently. If the router fails to commit in that window,
hydration proceeds with an unresolved tree. Throwing a diagnostic after the
bound would make the failure local instead of surfacing later as a hydration
mismatch.

## 11. Ecosystem packages have different maturity levels

Severity: medium for user expectations, not necessarily implementation quality.

The root description tends to group every `@octanejs/*` package as a faithful
React-library port, but their current scopes differ:

- Zustand and TanStack Query are thin bindings over framework-agnostic cores.
- TanStack Router is broad, but its README's deferred list has already drifted
  from files now present in `src/`.
- Redux supports the hooks API; `connect` intentionally throws.
- Recharts currently exposes the static BarChart/LineChart pipeline rather than
  the full upstream public surface.
- Motion documents important projection, drag, reduced-motion, and sequencing
  limitations.
- Lexical reports 35 of 39 binding modules, with collaboration/extension/
  devtools work explicitly deferred.
- Radix reports the unified component surface complete, with remaining
  SSR/hydration and polish work.
- Base UI is explicitly alpha/in progress.
- Testing Library and MDX are intentionally thin ports over reusable cores.

Publish one generated or centrally maintained status table containing upstream
version, supported surface, known divergences, SSR/hydration status, and last
parity verification. Link every package README and the website bindings page to
that table. This would make strong claims precise without underselling the
packages that are genuinely near-complete.

## 12. Benchmark gates do not make every failure fatal

Severity: low-to-medium; current policy is explicit.

The unified benchmark system is strong: hardware-independent ratios are gated
weekly, deterministic size suites are included, and local absolute baselines
are correctly treated as machine-specific. Two caveats should remain visible:

- only selected target/reference operations have committed ratio guards;
- a harness correctness failure is written into JSON and may exit non-zero, but
  the unified runner intentionally does not make `harnessExit` fatal by itself.

That means a correctness gate can fail without failing weekly benchmark CI if
no checked ratio also breaches. Correctness failures should be fatal unless a
suite is explicitly allowlisted with an issue and expiry date. Performance
ratios can remain tolerant; correctness should not be.

The current codegen gzip guard is intentionally tight: the recorded compiled/
source ratio is already close to its 1.12 ceiling. Because this suite is
deterministic, that is useful, but compiler features that legitimately add code
will need an explicit reviewed ratchet rather than an unexplained CI failure.

## 13. Release and compatibility discipline

Severity: low while all packages are alpha, increasing with adoption.

Changesets enforce patch-only releases for `0.x`, and publish/release workflows
run the changeset check. Pull-request CI does not run that check, so an invalid
major/minor changeset is discovered later than necessary. Add
`pnpm changeset:check` to PR CI when a changeset file is present.

CI tests Node 22 and 24, while the Vercel adapter accepts Node 20, 22, or 24 and
the website says Node 20 or later. Either add Node 20 to the relevant server/
adapter matrix or narrow the documented/supported versions.

Bindings depend on `octane` through workspace ranges and consume raw TS/TSRX in
development. Before stable releases, test packed tarballs in a small external
consumer project. That catches publishConfig, declaration, exports-map, and
compiler/runtime-version problems that workspace-source tests cannot.

## Suggested execution order

### Immediate

- sandbox or opt-in-gate playground execution;
- fix RuleSync, README, differences-from-React, Testing Library, and MCP maps;
- add `rules:check` to CI.

### Next correctness pass

- resolve nested-children hydration marker borrowing;
- design phase-correct deletion cleanups and insertion/layout update ordering;
- index the five executable parity gaps automatically;
- serialize or isolate website production builds.

### Structural hardening

- centralize duplicated compiler/runtime tables;
- centralize hook-slot exclusion metadata;
- make benchmark correctness failures fatal by default;
- publish a binding-status matrix and add packed-consumer tests.

### Continue measured optimization

- land marker-elision M3 only with client/server/hydration symmetry;
- continue size and same-session performance A/B gates;
- preserve the `parallelUse` opt-out and conservative warm-plan analysis.

