# Native block handlers

Issue #981's Compiler output item identified a new closure and native event slot
write on every render for multi-statement inline handlers. This change lifts a
block arrow's body to one module-level function and carries one or two immutable
lexical captures in the existing fixed-field event bundle representation.

The block still runs only when the native event fires. Member reads, getters,
method receivers, mutation, error propagation, cancellation, native event
identity, and `currentTarget` retain their authored timing. The native event is
passed before the captures. Ordinary `() => fn(args)` bundles keep their exact
authored argument lists and receive no extra event.

## Reproduction and measurements

```sh
node benchmarks/compiler-output/handlers.mjs /path/to/baseline
node benchmarks/compiler-output/handlers.mjs
BENCH_JSON=/tmp/handler-work.json node benchmarks/compiler-output/handlers.mjs
```

Measured against `68d1ea120` on macOS arm64, Node 24.20.0, Chromium
149.0.7827.55. Baseline and candidate use the same compiler inputs, production
flags, minifier, browser, and semantic controls. Every sample performs 128
observed updates, checks the survivor button and the resulting click captures,
then removes instrumentation. Timing samples warm 1,000 clicks and collect 20
rounds of 4,000 clicks and 500 updates. Two processes per revision run A–B–B–A.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Event slot writes, 128 updates × two block handlers | 256 | 0 |
| Render-local arrow sites, mount + update × two handlers | 4 | 0 |
| Emitted bytes, two handler modules | 1,493 | 1,366 |
| Minified bytes, two handler modules | 764 | 694 |
| Gzip bytes, two handler modules | 535 | 519 |
| Ordinary two-argument event module, minified bytes | 319 | 319 |
| Three-capture block control, slot writes | 128 | 128 |
| Three-capture block control, minified bytes | 378 | 378 |

The closure-site metric parses the emitted program; it counts arrows nested
inside render functions. The work metric observes actual native event slot
writes, then verifies current captured values, cancellation, and surviving DOM
identity through a real Chromium event. BENCH_JSON exposes both metrics against
the retained three-capture control, with source and semantic hashes.

There is a startup cost for the new runtime support. An isolated application
with one captured value grows from 160,668 to 161,050 minified bundle bytes
(52,083 to 52,199 gzip); two captures grow from 160,662 to 161,076 (52,088 to
52,219 gzip). The ordinary event bundle grows by 52 raw / 23 gzip bytes due to
the additional event dispatch cases. These are full production bundles using
the public client entry, not sums of the smaller compiler outputs.

Median microseconds per native click in each process:

| Handler | A1 | B1 | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| One capture | 1.638 | 1.613 | 1.688 | 1.888 |
| Two captures | 1.637 | 1.750 | 1.613 | 1.913 |
| Ordinary bundle control | 1.800 | 1.900 | 1.763 | 2.050 |
| Retained larger block control | 1.700 | 1.600 | 1.637 | 1.837 |

Update medians mostly round to 0.4µs. Baseline dispatch drift exceeds the
candidate/control differences. These results support the deterministic reduction
in closures and property writes, **not an application latency improvement**.
The additional ordinary bundle dispatch comparison remains a small runtime
cost; these browser samples found no reproducible timing regression.

## Capture and lifetime audit

Captures are identifiers, never pre-evaluated member expressions. Parameters and
`const` bindings qualify only while the owning body contains no assignment to
that identifier, including writes in deferred functions and loop targets. The
proof refuses dynamic `eval`, function-scoped `var`, and declaration kinds
outside its variable/function binding model (including classes and runtime
TypeScript declarations); conservative same-name
writes in shadowed scopes merely decline the optimization. Existing module
bindings remain module reads, preserving their live binding semantics.

One module function per eligible handler contains no component values. The
mounted descriptor owns the latest captures and shares the existing binding
bag, transaction journal, and dispatch-snapshot lifecycle. Synchronous updates
inside a native phase snapshot the negative arity tag and captured values;
nested dispatch uses the newly committed values while the queued outer phase
keeps its previous values. Unmount releases those references through the existing
DOM and scope cleanup. There is no per-render capture array.

The simpler compiler-only alternative could bundle only zero-parameter arrows;
it cannot forward the native event under the existing exact-argument contract.
The selected design adds two mount helpers and negative arity tags, reuses the
existing update helpers, and adds no fields to existing event descriptors.

## Retained cases

- More than two captures: a general environment would allocate an array each
  render. Keep the existing closure until a measured representation justifies
  that tradeoff.
- Mutable bindings, direct `eval`, `var`, lexical `this`/`arguments`/`super`,
  meta-properties, class/enum/namespace declarations, async arrows,
  JSX/hook-containing bodies, and arbitrary
  parameter patterns keep the authored closure.
- HMR, profiling, and native-read compiler modes keep the previous path.
- Already mount-stable handlers remain on their established mount-only path.
- Spread-owned events, native event aliases sharing a slot, and custom host
  property handlers retain their existing
  property and source-order machinery. The new lifting applies to direct
  delegated event bindings.
- SSR omits host event handlers as before. Client hydration installs the same
  optimized bindings while adopting the server's DOM.

These cases are audit dispositions, not claims that their allocation costs
were removed. Compilation throughput and heap size were not measured.

## Correctness evidence

`packages/octane/tests/block-events.test.ts` passes all fifteen tests in development
and production runtime projects (30 executions), including native event identity,
cancellation, current target, deferred ref/getter reads, receiver binding,
mutable captures, nested-block `var`, lexical arguments, class/enum scopes, keyed survivor updates,
state updates, nested event dispatch, listener errors, suspended root rollback,
native event aliases and their last-writer order,
unmount, and server node adoption.

Removing the native event argument from the two-capture dispatch path made six
new test executions fail; restoring it returned the suite to green. Independent
review caught local classes and enums being mistaken for module bindings by the
shared component-local inventory. Their behavioral tests failed four executions
before the final declaration guard; they now pass. The nearby
`attrs-events` and `audit-events-portals` suites plus the final handler tests
passed 120 executions with all fifteen final cases. The compiler event-callback
codegen suite also passes. Native alias order tests first reproduced eight
failures before the final shared-slot guard.
