# Context and render-body ownership

This audit covers the correctness follow-ups discovered by #1080 and #1081:
nested scoped context reads, independently compiled hook/cache ownership, mixed
full/lite component ownership, and changing resolved lazy bodies. It does not
claim that every performance proposal in #981 has been implemented.

## Contract

- A stable JSX array must reflect its represented Provider's current value,
  including through cached nested descriptors, memo boundaries and inspections.
  An outer resolver that catches an inner error must retain the failed attempt's
  context dependencies so its fallback can recover.
- Independently evaluated modules own separate hook and compiler memo identities.
  Returning to a previously reached body retains that body's hooks. Shared child
  components retain their identity; a different child component type receives
  its own lifetime.
- A resolved lazy module may expose a render-time default getter. A body change
  invalidates output belonging to the previous body in each mounted scope.
  Equal props and previously installed memo metadata cannot hide the handoff.
- A suspended candidate restores the accepted body, output, state, refs and
  effects. Hydration adopts compatible server DOM and keeps typed input state.

## Design and costs

Numeric hook keys and memo-region identifiers use the existing module range
allocator. The range covers the larger of the hook and memo-region counts;
these identities index separate Maps, not dense DOM-slot arrays. Modules without
either kind of identity still need no reservation. The server has no client
memo-region counter, so its reservation uses the hook count alone.

Direct component children in a replaceable Provider/lazy body use full component
ownership. The ordinary lite entry adds a scope comparison; ordinary descendants
keep the lite path. A temporary current shared scope is restored in `finally`.
This avoids a per-Scope flag or separate retained DOM-range cache. The existing
Provider benchmark now records full Block construction as well as update work.

Each lazy wrapper creates one body-identity Symbol. Each resolved mounted scope
stores its current body in its existing hooks Map, creating the Map if needed.
An ordinary resolved render performs a Map lookup. A body change invalidates
existing output regions and journals the identity for rollback. The marker is
released with the owning scope. Lazy comparator dispatch supplies the mounted
scope internally; authored comparators still receive exactly two arguments.

Scoped descriptors reuse their captured context Maps and replay dependencies
onto the consuming block and enclosing capture. A surrounding capture may now
allocate the dependency Map it previously omitted incorrectly. Descriptors that
read no context add no Map or Scope field. Successful cached values are not
overwritten by a failed read's dependency set.

## Reproduction and measurements

```sh
node benchmarks/bench.mjs --ratios body-ownership
BENCH_JSON=/tmp/ownership.json node benchmarks/hook-memo/body-ownership.mjs

# Extract baseline packages/octane/src and package.json, and supply installed
# dependencies through the external root. Run this same runner on both sides.
OCTANE_OWNERSHIP_ROOT=/tmp/baseline \
OCTANE_OWNERSHIP_EXTERNAL_ROOT=/path/to/worktree \
OCTANE_OWNERSHIP_ALLOW_STALE=1 \
BENCH_JSON=/tmp/ownership-before.json \
node benchmarks/hook-memo/body-ownership.mjs
```

The baseline exception permits and records stale text only. It still enforces
mount, cleanup, typed-input identity and clean/observed equivalence. The normal
runner requires zero stale results. The runner compiles independent modules
with inline hooks both enabled and disabled, then exercises 128 unchanged
updates and repeated body switches. It also renders one lazy wrapper and a
stable array containing a scoped context reader.

Two separately bundled production programs execute the same work. Authored
observers are eliminated from the clean program; the observed program counts
memo computations and scoped resolutions. Both must produce identical semantic
snapshots. JSON records Node/esbuild versions and source, compiler, compiled
fixture, runner and semantic hashes. These are deterministic work counts and
bundle sizes, not heap-allocation, GC, throughput or browser-latency measurements.

Baseline is upstream `8e5ca22a6` (merged #1081), with the same Node 24.20.0,
esbuild 0.28.1, TSRX core 0.1.71, installed dependencies and options.

| Work | Baseline | Candidate |
| --- | ---: | ---: |
| Stale requested results | 70 | 0 |
| Ordinary memo computations across two independent bodies | 1 (aliased) | 2 |
| Inline memo computations across two independent bodies | 1 (aliased) | 2 |
| Extra memo computations during 128 unchanged updates, each mode | 0 | 0 |
| Extra lazy memo computations during 128 unchanged updates | 0 | 0 |
| Scoped resolutions during 128 unchanged context updates | 0 | 0 |
| Scoped resolutions during 128 changed context updates | 0 (stale) | 128 |
| Full Blocks constructed by the existing inline Provider mount | 3 | 4 |
| Full Blocks constructed by the existing direct Provider mount | 3 | 3 |
| Full Blocks constructed by the existing inline memo Provider mount | 5 | 5 |
| Full Blocks constructed during 128 inline Provider updates | 0 | 0 |
| Clean ownership application, minified bytes | 190,130 | 190,664 |
| Clean ownership application, gzip bytes | 61,087 | 61,335 |
| Existing Provider application, minified bytes | 200,377 | 200,644 |
| Existing Provider application, gzip bytes | 63,916 | 64,018 |

A separate closed-application Vite build checks the ordinary lite path. Its
`main.ts` imports `createRoot` and an imported `Main`, then calls
`createRoot(document.getElementById('app')!).render(Main)`. The view module is:

```tsrx
function Label() @{ <span>value</span> }
export default function Main() @{ <section><Label /></section> }
```

Both sides use the public `octane({ hmr: false })` plugin, a temporary package
declaring Octane as a dependency, `mode: 'production'`, `target: 'esnext'`, and
an IIFE library build. The readable output is minified with esbuild using the
same target. Root specialization removes the generic `createRoot` on both
sides; both already retain the full component slot implementation. Size changes
70,032 → 70,149 minified and 23,695 → 23,740 gzip bytes. Thus this probe finds a
small shared-path cost, without newly retaining the full reconciliation graph.

The inline mount replaces one lite child with full ownership. Existing Provider
memo-hit and dispatch guards stay unchanged. Eight new same-run ratio guards
protect the table's caching and semantic controls. Returning to the frozen
runtime/compiler fails the behavioral regressions and the stale-result guard;
recomputing every unchanged body would fail the zero-work guards.

## Review and limits

Review caught the server's absent client memo counter, caught-inner-read
dependency loss, and unnecessary double dispatch through the public component
slot wrapper. Each was corrected before final validation. Rendering tests cover
development and production, authored TSRX, native reads, distinct Providers,
multiple lazy mounts, server hydration, mixed compilation modes, repeated
switches, held retries, supersession, native events and cleanup.

This change preserves the previously documented retained costs in the
[descriptor renderer audit](../descriptor-renderer/README.md) and
[root transaction audit](../root-transactions/README.md). Other #981 SSR and
universal-renderer performance proposals remain separate work.
