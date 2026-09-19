# Unchanged native callback bookkeeping

The consumer contract is unchanged: native callbacks receive the latest authored
captures, event ordering uses phase snapshots, and handler publication refreshes
authority even when callback data stays equal. Failed or abandoned rendering
must retain the previous callback and owner. Retired invocation tokens remain
retired; late signal imports still inherit the precise event invocation.

The proposed seam is only the fixed-arity/native argument bundle data journal.
Staged projection remains first so comparisons see earlier pending writes.
Changed fields preserve queued dispatch data and enter the existing object
journal before mutation. Unchanged data avoids those operations, then executes
the existing owner-publication gate. Capture comparisons distinguish signed
zero and preserve NaN. Array captures keep their existing reference semantics.

The benchmark compiles an unchanged authored no-handle keyed view through the
public compiler in development and production. It builds exact selected runtime
source with the matching `NODE_ENV` mode and observes journal Map insertions whose keys are live native callback
bundles. These operations correspond to object-snapshot records in the current
journal window; they are not a whole-application heap-allocation measurement.
The controls check changing text/title, reorders, draft input/host identity,
native argument delivery, genuinely changed captures, and unmount cleanup.

Reproduce with `node benchmarks/scoped-signals/event-metadata.mjs [baseline-runtime.ts]`
and `node --test benchmarks/scoped-signals/event-metadata.test.mjs`.

## Matched results

Node 24.19.0, pnpm 11.15.1, esbuild 0.28.1, current frozen lockfile,
base `9291944a2091cdfc3f5a7a5223c8f7fdef50cc48`. Authored and compiled
fixture hashes match for both runtimes. Both development and production pass
the same semantic controls.

| Operation | Baseline | Candidate |
| --- | ---: | ---: |
| Snapshot records: 100 rows, four updates with unchanged captures | 1,200 | 0 |
| Snapshot records: one capture changes in each row | 300 | 100 |

The first workload removes 1,200 object spreads, journal Map insertions, and
four-slot snapshot records (4,800 log slots). The changed-capture control retains
the 100 required snapshots. The nominal bundles, authority WeakMaps, deferred
invocation recipes, retirement tokens, and journal window lifetimes stay intact.
There are no new caches, fields, callbacks, subscriptions, or retained references.

The three fixed-arity updater paths and array-identity path add equality checks.
This guards general callback journals; it does not eliminate prospective signal
authority metadata or close the remaining unused-signals allocation report.
No application latency, CPU improvement, or whole-heap allocation claim is made.

The compiled no-handle fixture grows from 203,463 to 203,563 minified bytes
and 65,106 to 65,140 gzip bytes (+100/+34). A compiled actual-model renderer
consumer retaining the one-capture updater grows by 34 minified/15 gzip bytes.
All 13 matched public export, engine, SSR, native, binding, and bootstrap closures
are byte-identical. No policy is transferred into standalone engine or SSR.

Behavioral controls cover stable callbacks changing owners, ordinary and staged
publication, hydrated DOM adoption, Strong compilation, signed zero, NaN,
changed callbacks, dispatch snapshots, and cleanup. Deliberate broken owner
refresh and signed-zero comparisons must be rejected before handoff.
