# Signal Chat Metrics graph gate

This is a **nonfunctional, benchmark-only diagnostic**, not a proposed Octane
optimization. It asks whether the existing production Signal Chat `/` route
could leave the shared renderer out of its initial graph if both its composed
root and its load-triggered Metrics island could run without that renderer.

`run.mjs` snapshots the real example and builds two unmodified controls and a
third variant using the same Vite production configuration. In the third
build, `worker.mjs` replaces only the compiled client activation for the Metrics
independent boundary with an empty default function. It verifies that the
targeted generated module contains the Metrics import and that exactly one
substitution occurred. The authored app files, server compilation and CSS are
not rewritten. All five independent records remain in the server manifest.

The stub does not adopt or update Metrics, schedule its timer, report errors,
export captures, handle events, manage its signal and owner contracts, or
provide a real fallback. Its apparent reductions are not achievable savings
until those behaviors have an equivalent implementation. The candidate has no
lazy copy of the original Metrics activation, so its all-file total excludes
the fallback cost that a functional design would need to account for.

## What the graph shows

The unmodified bootstrap statically imports the renderer through `hydrateRoot`.
Its server response also emits a module preload for the route's `App` module,
which imports the renderer. Independently, the original load-triggered Metrics
activation imports the renderer. Replacing Metrics alone leaves the renderer
in the actual static entry closure.

The runner reports four distinct graph views, summing each emitted file's
offline gzip-9 size:

1. **Static entry:** the emitted hydration entry and its static dependencies.
2. **Default route model:** that closure plus the route, pre-hydrate hook,
   independent-island bootstrap, streamed-signal owner and load-triggered
   Metrics activation, following each root's static imports. These roots are
   based on the generated bootstrap and SSR output; this is not a browser
   request recording and excludes HTML and CSS.
3. **All reachable:** the complete emitted client JavaScript graph, following
   both static and dynamic imports from the entry. The reported lazy remainder
   is all reachable files outside the default route model.
4. **Root-deferred counterfactual:** the default model with the route removed
   and the entry-to-renderer edge cut in the graph traversal. This assumes the
   route's server preload and immediate evaluation are also deferred, while
   retaining the pre-hydrate, island and stream-owner roots. The emitted entry
   actually still contains the import and the emitted server still preloads
   the route. No working bootstrap is generated for this case.

The last view is an optimistic calculation for these particular edges, not a
hard bound on other designs. A real implementation may split or duplicate
chunks differently and needs additional code and a reachable fallback.

## Result

The following run used Node and lockfile-matched installed dependencies on the
local worktree. The repeated baseline differs by two gzip bytes in its entry:
the runner checks that its only byte difference is the generated build UUID,
and that every other reachable JavaScript file is identical. CSS hashes match
across all three builds.

| Offline gzip-9 | Baseline | Repeated baseline | Metrics stub |
| --- | ---: | ---: | ---: |
| Static entry | 107,449 B | 107,451 B | 107,375 B |
| Default route model | 148,223 B | 148,225 B | 133,217 B |
| Reachable only beyond default model | 6,579 B | 6,579 B | 18,523 B |
| All reachable client JS | 154,802 B | 154,804 B | 151,740 B |
| Root-deferred counterfactual | 145,025 B | 145,027 B | 37,589 B |
| CSS | 2,229 B | 2,229 B | 2,229 B |

The stub moves the roughly 11.9 KB gzip shared State chunk out of the modeled
initial path and replaces the Metrics activation chunk with a 55 B gzip stub.
The renderer is still in the candidate's real static entry. In the separate
root-deferred calculation, the original Metrics keeps the renderer reachable;
only the combination of that hypothetical root change and the nonfunctional
stub leaves it out. The latter removes 95,628 B from this stub build's modeled
default path, made up of the original emitted renderer and route chunks. That
number omits any replacement or fallback and is not a forecast of actual
application savings.

The runner verifies identical copied application source and selected toolchain
hashes before and after all builds. It calls each generated server handler,
checks the real shell, Metrics, other panels, stream frames, five independent
records, the Metrics load trigger and the route preload; it also compares the
visible Metrics SSR text and CSS hashes across variants. This is a bounded SSR
check, not full server equivalence, client functionality or stream-ownership
proof. No candidate browser requests or latency were measured.

The historical temporary report was named `octane-metrics-gate-0gTtoG/report.json`;
it recorded source and selected toolchain hashes, emitted files, manifests,
module graphs and SSR captures. It is not published with this repository and
may have been removed by the OS; the hashes do not cover installed dependency
contents or the operating system.

## Reproduce

```sh
node benchmarks/streamed-shell-prototype/metrics-gate/run.mjs
```

Further work requires a real lightweight Metrics activation with equivalent
updates, events, timer and cleanup behavior; proven stream and document
ownership; a root path that preserves pre-hydrate ordering, updates, remounts
and mismatch recovery; a correctly accounted fallback; and matched browser
testing of the complete application. None is implemented by this diagnostic.
