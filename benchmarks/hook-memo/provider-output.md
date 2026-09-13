# Retained Provider output

`provider-output.mjs` compares the compiler and runtime selected by
`OCTANE_PROVIDER_ROOT`, with dependencies supplied by
`OCTANE_PROVIDER_EXTERNAL_ROOT`. It uses the same authored source, production
compile options, esbuild bundle options, and 128-update workload in either
checkout. There is no timing claim.

```bash
node benchmarks/hook-memo/provider-output.mjs
BENCH_JSON=/tmp/provider-output.json node benchmarks/hook-memo/provider-output.mjs

# Run this same script against extracted baseline source and current dependencies.
OCTANE_PROVIDER_ROOT=/tmp/provider-baseline \
OCTANE_PROVIDER_EXTERNAL_ROOT=/path/to/current/worktree \
OCTANE_PROVIDER_ALLOW_STALE=1 \
BENCH_JSON=/tmp/provider-baseline.json \
node benchmarks/hook-memo/provider-output.mjs
```

The baseline exception permits the known stale label only, records each requested
and rendered value, and still enforces every other semantic control. The normal
command requires zero stale labels. `OCTANE_PROVIDER_ARTIFACT` optionally writes
the clean, readable bundle for inspection.

`OCTANE_PROVIDER_DROP_BODY_TOKENS=1` is a separate negative control. It removes
only generated stable body-token arguments from the compiled AST, without
changing the runtime or authored source. The semantic checks still pass, but the
inline memo's `childSlot` work rises from zero to 256 calls and fails its ratio
guard. This demonstrates that the token protects a real optimization.

## Contracts and observation

The application first renders a Provider with freshly generated inline children.
It updates an unrelated outer attribute 128 times, then changes the captured
label 128 times. Next, it renders `First` directly as a Provider's children,
updates the Provider 128 times with that same body, and switches
`First → Second → First → Second → First`. Both named bodies contain a hook memo
and a memoized child call at compatible retained DOM positions.

Every update checks the label, retained input/label/button nodes, a typed
uncontrolled input value, focus, and the counter's state. Native delegated clicks
increment the counter before and after the sequence. Unmount must empty the
container. A second bundle, instrumented after compilation and tree shaking,
must produce the same semantic snapshot as the clean bundle.

The observer counts reached `Label`/`Counter` bodies and the three public
component-slot entry points, plus generated children registrations. These are
source work counts, not heap allocations. The inline fixture intentionally has
no automatic memo region inside its generated children; it protects the fresh
closure/capture path. A second inline fixture uses a calculated descriptor array
and does emit an automatic memo region inside its generated children. The direct
`First` updates and this calculated-array fixture protect actual memo hits.

## Same-environment measurements

Baseline: `3c1cc55d8`, extracted before candidate source edits. Environment:
Node 24.20.0, macOS arm64, esbuild 0.28.1, TSRX core 0.1.71, identical installed
happy-dom dependencies.
The JSON records dependency versions, fixture/runner/runtime/compiler hashes,
compiled-source hash, clean semantic snapshot, and each measured phase.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Wrong label after four body switches | 2 | 0 |
| Label renders during 128 same-body Provider updates | 0 | 0 |
| Counter renders during those updates | 128 | 128 |
| Component-slot entries during those updates | 128 | 128 |
| Generated inline children registrations | 128 | 128 |
| Component-slot entries during inline equal-capture updates | 384 | 384 |
| Label renders during inline calculated-array memo hits | 0 | 0 |
| Child-slot entries during inline calculated-array memo hits | 0 | 0 |
| Label renders during changed calculated-array captures | 128 | 128 |
| Label renders during 128 changed-capture updates | 128 | 128 |
| Clean application + runtime, minified bytes | 198,811 | 199,193 |
| Clean application + runtime, gzip bytes | 63,405 | 63,536 |

The correction performs the three previously skipped child renders during the
four switches. It retains the measured ordinary memo-hit and inline update work.
The complete clean bundle grows 382 minified bytes and 131 gzip bytes. The benchmark
does not measure the additional identity check's duration, allocation retention,
server behavior, hydration, or suspension; correctness suites cover applicable
rendering modes separately.

## Ratio registration

The existing `hook-memo` suite can run `provider-output.mjs` alongside `run.mjs`.
The measured target is `provider-output`; the denominator target is
`provider-output-reference`.

- `stale_output_count`: maximum ratio `0` (reference is one failure).
- `same_body_label_renders`: maximum ratio `0` (reference is 128 renders).
- `same_body_component_slots`: maximum ratio `1` (reference is 128 entries).
- `inline_memo_snapshot_slots`: maximum ratio `0` (reference is 128 entries).
- `inline_memo_label_renders`: maximum ratio `0` (reference is 128 renders).
- `inline_memo_changed_renders`: maximum ratio `1` (reference is 128 renders).
- `inline_body_component_slots`: maximum ratio `3` (reference is 128 entries).
- `inline_body_children`: maximum ratio `1` (reference is 128 registrations).

The clean size metrics remain available for comparisons without a machine timing
threshold or an invented runtime reference denominator.

## Remaining related correctness work

The unified `hook-memo` run also executes the earlier hook-allocation fixture.
In this installed environment, eight existing guards fail on both the frozen
baseline and candidate with identical non-size counts: eligible hit functions
704, eligible hit arrays 3,872, eligible miss functions 1,152, declaration miss
arrays 320, identifier hit/miss runtime functions 64 each, and null-dependency
hit functions/arrays 96/320. These pre-existing breaches are not corrected or
relaxed here. All eight new Provider guards pass.

This correction covers retained Provider scopes receiving different compiled
children bodies from the same module. Two related families remain separate:
compiler hook/cache identifiers can alias across independently compiled modules,
and lazy resolved-body replacement needs its own identity/invalidation audit.
They are not established as fixed by this benchmark or the targeted Provider
change. Neither the descriptor-renderer performance checklist nor these broader
body-identity cases should be marked complete from this result.
