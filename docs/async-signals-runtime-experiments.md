# Signal runtime: design decisions and experiments

This note explains which runtime and packaging ideas were retained, which were
rejected, and why. The measurements are historical, matched local experiments;
they are not current application budgets or device-performance results.
[Current checkpoint measurements](./async-signals-performance.md) are separate.

## Constraints that did not change

- A declaration is separate from its live value in a request, document, or
  component instance. `createScope` remains optional.
- Early edits retain their revisions; historical HTML and live values remain
  distinct. Direct native bindings preserve their ownership and cleanup rules.
- General `derived$` can produce a scalar, Promise, or async iterable. A smaller
  implementation may be selected only when the compiler can prove it is valid.
- Cancellation, invalidation, and document retirement reject obsolete results.
  One shared result producer can serve consumers with independent lifetimes.
- The graph continues to use Alien Signals. No second graph or runtime
  capability-registration phase was added.

## Retained changes

### Resolve a cached signal's owner once

Cached descriptor reads originally repeated owner resolution and identity lookup.
The optimized path resolves once and accesses the cell, keeping retirement and
site validation in their required order. Subscription capture still validates
after capture because a custom carrier can retire the owner during that call.

Against `8eb93b31506bdc84c0fea55f0df6e31b7f12ed6d`, a Node 24.21.0 / Apple M5 Max
run used five warmups and 15 paired ABBA/BAAB rounds of 200,000 cached reads:

| Owner path | Baseline mean ns/read | Candidate mean ns/read | Paired geometric ratio, 95% interval |
| --- | ---: | ---: | --- |
| Installed carrier | 39.47 | 24.81 | 0.628 (0.613–0.644) |
| Explicit global owner | 41.79 | 24.47 | 0.585 (0.572–0.599) |
| Instance-local owner | 72.36 | 51.12 | 0.706 (0.694–0.719) |
| Alternating instance owners | 76.55 | 54.60 | 0.713 (0.703–0.724) |

These loops show less cached-read work, not application latency, construction
cost, or browser-default-owner performance. Ownership, unsubscribe, and retirement
were untimed correctness controls. The maintained
[scoped-signals benchmark](../benchmarks/scoped-signals/README.md) documents
`run-owner-reads.mjs` and its source verification.

### Select computation implementations at compile time

The calling module supplies a computation constructor through one private
lifetime interface. Primitive-producing syntax, or an eligible explicit
`{ sync: true }` callback, can select the scalar implementation. Unknown returns,
context callbacks, mutable options, and global calls retain the general path.

Neither zero parameters nor `'use strong'` proves a synchronous result.
Even `String(...)` calls a replaceable global. The real behavior fixture keeps
that call and therefore keeps the general implementation.

Independent esbuild export bundles shrank, but the full behavior fixture changed
only 26,477 → 26,425 gzip bytes. The much larger scalar-only prototype saving
was not attributed to that unchanged full-query workload. Ordinary client/server
entries and inline capture were unchanged in this experiment.

### Keep query construction out of query-free owners

The remaining scope methods made query implementation reachable even for
consumers that used only writable and synchronous derived state. Query callers
now supply the resource constructor statically.

The compatibility change is narrow:

```ts
// Before: scope.asyncSignal$(key, describe)
// After:
import { createResource } from 'octane/signals';
createResource(scope, key, describe);
```

Normal `query$` authoring and explicit `createScope` stay supported. There is no
dynamic import, registration order, delayed producer start, or alternate graph.

Matched Vite/Rolldown builds against `e186799a79aef12fe8d93ebebe3742e89ae47b81`
use the same receipt fixture, whose initial state and native controls load before
its real query consumer:

| Consumer / phase | Baseline gzip-9 bytes | Candidate gzip-9 bytes |
| --- | ---: | ---: |
| Query-free receipt startup | 25,269 | 20,573 |
| Receipts plus optional query consumer | 25,668 | 24,663 |
| Full-query control startup | 25,347 | 25,402 |

Most startup savings are deferred query work, not deleted functionality.
The full-query control grows slightly. The inline capture is unchanged.

### Preserve effects when removing unused declarations

A declaration can be removable without making its arguments removable.
The compiler's conservative proof preserves initializer side effects, getters,
and invalid-call diagnostics. Unsupported or ambiguous syntax stays general.

A shared-module prototype removed 1,823 gzip bytes of unused query/async
declarations. All-used controls were byte-identical. The retained change also
has compiler controls for shadowing, options, and argument evaluation; this is
selective-import behavior, not a promise that every shared module becomes small.

### Snapshot seeds without repeated encode/decode cycles

Incoming seeds still need validation and an immutable copy. Repeating tagged
encode/decode traversals was unnecessary; the retained snapshot path avoids them
without exposing mutable historical state.

In a matched 200-row Node workload, five warmups and 15 alternating rounds of
60 operations measured initialization/read/disposal at 0.768 → 0.569 ms median,
and historical adoption/read/release/disposal at 0.788 → 0.578 ms.
Serialization's smaller difference was not a supported speedup claim.
These are isolated seed operations, not complete SSR or browser latency.

### Static result-only streaming receiver (2026-09-13)

A host that owns HTML placement does not need the placement implementation merely
to receive signals. `bootstrapStreamedSignalResults` selects the results-only
receiver; `bootstrapStreamedSignalHydration` retains region registration.
They share the same identity, selection, mailbox, deadline, failure, and document
ownership rules. There is no second initialization phase.

In matched receipt builds, both eager and eventual delivery dropped 1,203 gzip
bytes; the full receiver control grew 117. The result-only path still validates
frame ordering and rejects stale or unregistered placements. Removing placement
code does not remove transport checks.

### Share only the class helper that bindings need

`normalizeClass` moved unchanged into a dependency-free `class-names.ts` leaf.
Existing renderer/SSR callers retain the `css.ts` re-export, while fixed-tree
bindings import the leaf. A split-renderer fixture saved 2,240 eager gzip bytes
but only 90 eventual bytes: style machinery moved back to its actual consumer.
The [performance note](./async-signals-performance.md#what-the-packaging-changes-achieved)
records the matched control and its limits.

## Bundler findings

Esbuild 0.28.1 kept optional query implementation in the eager graph through a
shared barrel. A five-module control reproduced the grouping with pure functions
and `sideEffects: false`. Pointing imports directly at implementation files
changed the prototype, but would impose another authoring convention.

Vite 8.1.5 / Rolldown 1.1.5 and Rspack 2.1.4 kept the optional function cold in
the minimal control. The complete receipt fixture also passed under Vite without
rewriting imports. Rspack coverage here is the minimal control, not that complete
fixture.

No bundler patch or compiler import-routing layer was retained. The benchmark
selects `--bundler=vite` explicitly for query-free startup, retains the historical
esbuild lane, and still fails its receipt boundary under esbuild. A successful
single-entry tree-shake is not proof of a correct split-build boundary.

## Rejected experiments

These are separate experiments, sometimes deliberately incomplete. Their
savings overlap and cannot be added together.

| Idea | Observation | Decision |
| --- | --- | --- |
| Remove remaining scope convenience methods | 306 gzip bytes; 602 including inspection/serialization | Too little benefit for broader API removal |
| Lazily allocate owner collections | 12 → 2 initial Map/Set constructions; +124 gzip bytes | Allocation hypothesis; unprofiled indirection, not a bundle win |
| Replace Octane's graph layer with the public Alien API | No matched semantic result | Ownership, dormant invalidation, historical reads, and wrappers remained unresolved |
| Load general computation code on first need | 606 fewer initial gzip bytes; 1,445 more eventual bytes | Added loading/failure/lifetime complexity and changed first-use timing |
| Flatten request/node state | Tens of gzip bytes saved | Did not justify snapshot and representation complexity |
| Use native private fields as a size strategy | −37 gzip bytes at ES2022; +424 after ES2020 lowering | Not a consistent cross-target improvement |
| Move native read-source creation to the observer | −29 to −37 gzip bytes; another control grew 33 | Negligible benefit |
| Make more scope helpers static | About 437–498 gzip bytes in the tested fixtures | Incomplete type migration and unnecessary API churn |
| Remove the transport adapter and rely on the result receiver | 747 gzip-byte deletion ceiling | Incorrect: accepted a 2,048-byte value under a 1,024-byte frame limit |

The on-demand-code prototype needed a monotonic deadline check because module
resolution could win a race with an overdue timer callback. Even with that fix,
it increased total delivery. It was not retained or browser-qualified.

Receiver and engine queues represent different readiness states and often
transfer ownership rather than duplicate frames. Removing one based only on
similar-looking data weakened bounds in the transport prototype. That failed
control is why the deletion ceiling is not a valid optimization.

## What these experiments suggest

Prefer precise static dependency boundaries and less repeated work within the
existing owner model. Verify them against real compiled imports and complete
split graphs, including automatic later loading. Do not equate fewer source
lines, fewer imports, or a smaller initial chunk with lower total cost.

Unresolved opportunities include repeated structural identity work in SSR and
the cost of fully used query/stream support. Any follow-up must preserve the same
input, result, cleanup, and ownership controls and measure its final emitted
workload.

Historical reports used local source and output fingerprints. Some scratch
artifacts are no longer available; the tables are recorded observations, not
freshly repeated results. Current CI and acceptance status belong in the
[implementation guide](./async-signals-implementation.md).
