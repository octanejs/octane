# Remaining SSR replay, streaming and output investigations

Issue [#981](https://github.com/octanejs/octane/issues/981). Frozen baseline:
`248af4edc30c80498dec13dad4f6d7508f10f220`, after #1088 and #1090.
These dispositions complete the remaining investigations; retained costs are
explicit decisions, not claims that those operations have disappeared.

```sh
node benchmarks/bench.mjs --quick --ratios ssr-final-replay
SSR_SOURCE_ROOT=/path/to/frozen/source node benchmarks/ssr-final-replay/work.mjs
node benchmarks/ssr-final-replay/diagnostics.mjs
node benchmarks/ssr-final-replay/strings.mjs
```

`work.mjs` is the deterministic CI suite. It builds separate clean and observed
production server bundles with the same compiler and fixtures. Every scenario
compares consumer output or stream ordering between them. Source, fixture,
bundle and semantic hashes are recorded. `BENCH_JSON` writes the normal suite
schema. The other two scripts are standalone Node/V8 diagnostics, not CI tier,
heap, or timing gates. Run them on the documented Node 24 environment.

## Changes retained

1. Boundary selection iterates the registry directly. It retains sorted result
   arrays for emission, nearest-ancestor reachability, wave ordering, and abort
   reporting. The pending predicate short-circuits without materializing the
   entire registry. These scans only read private records and Maps/Sets; no
   user render, error callback, or transport write runs during selection.
2. A completed boundary's discarded fallback borrows the existing immutable
   CSS/head replay snapshots. Its rollback still restores live collections and
   invalidates their memo copies. This extends #1088's existing collector
   design without adding a new cache, owner, invalidation mechanism or lifetime.

| Scenario | Baseline | Candidate |
| --- | ---: | ---: |
| 32 producers, 32 waves: temporary boundary arrays | 131 | 0 |
| Same: copied boundary references | 4,192 | 0 |
| 32 producers, one wave: arrays / references | 7 / 224 | 0 / 0 |
| Empty stream: arrays | 3 | 0 |
| Error control: arrays / references | 7 / 21 | 0 / 0 |
| Abort control: arrays / references | 8 / 24 | 0 / 0 |
| 16 populated resource groups, 8 waves: Map/Set copies | 832 | 688 |
| Same: collection entries copied | 8,992 | 6,688 |

The two changes together grow the broad server/fixture bundle by 122 minified
bytes (114,555 → 114,677) and 27 gzip bytes (37,635 → 37,662). These are actual
evaluated copy/closure sites, not V8 allocation sampling. No latency or general
SSR throughput improvement is claimed. The single-wave, empty, rejection,
abort, and nested-stream controls prevent crediting removed output as saved work.

## Per-entry retained decisions

### Changed CSS/head generations and other component snapshots

The growing 16-resource prefix still copies populated generations. Retrying its
descendant twice performs 75 copies / 720 entries; the settled twin uses 64 /
544, and their full HTML/CSS results match. A length or size checkpoint cannot
restore an overwritten entry or a preload-to-preinit transfer/deletion. Reusing
the live Map was executed as a negative control: rewind loses previously
established CSS. Retain immutable snapshots for changed generations. A mutation
journal would move work to every resource writer and introduce a second rollback
protocol; the measured duplicate copies are removed using the existing cache.

The nested resource/stream replay executes 20 nonempty list copies / 26 entries
and 8 ViewTransition snapshots / 8 entries. They preserve the active content and
fallback owner paths and the mutable `consumed` state of VT candidates across
rewinds. A raw stack reference would change underneath an earlier checkpoint.
Keep these bounded copies and the distinct empty/absent representation.

Frame occurrence/scoped-child snapshots have zero nonempty array copies in the
recorded scenarios. Component entry frames begin empty; retries restore their
initial state rather than retaining counters from discarded work. A separate
revision cache would add state to that already-empty path. Existing
`ssr-render-phase-state.test.ts` covers flat-list and promoted-Map occurrences,
multiple keyed arms, repeated resource rewinds, nested renders and `useId`.

`HookPass.hooks` and `.occ` remain lazy, as merged in #1077; hook-free work does
not instantiate those Maps. The suite separately counts actual Map creations
and `hookPosition` records. Keep a fresh short-lived position record: a global
scratch record is observably incorrect when a memo callback renders another
component before storing its own result. The executed scratch-record mutant
fails the nested memo/retry value control. An out-parameter design would add
mutable state or parallel output channels to five callers for an unmeasured
gain. Positional state is released with its component pass; it is not cached
across requests.

### Pending probes, suspended lists, canonical retries and closure cost

The 32-wave workload still executes 528 suspended-list visits, 496 ordinary
pending read probes, 33 canonical full passes, 1,056 `ssrTry` calls and 13,728
closure-expression evaluations. The one-wave control executes 32 visits, zero
repeat read probes, 2 full passes, 64 tries and 832 closure sites. These counts
stay equal before and after the change.

Retain ordinary probes: a thenable can initialize lazily on `.then()` and
fulfill or reject synchronously. Removing the pending probe fails a public
synchronous render control. Resolved producers continue to use their existing
cached outcomes. A per-read skip cache would need a new protocol assumption
about externally mutable thenables; the existing settlement registry does not
grant that assumption.

Retain wave membership scans: a still-pending producer may acquire another
occurrence key, and a vanished producer must not wake an unrelated active wave.
Keep first-writer outcomes, coalescing, and the final abort check. The local
change removes materialization around boundary selection, not these required
membership decisions.

Retain the canonical final render. The buffered control performs two full
passes and two discovery rounds. An ancestor changes its supplied label while
the child is suspended; the emitted result contains the new label, not the
props captured by a discovery job. Emitting discovery output would be stale.
Streaming also needs full reachability and resource discovery before publishing
new segments; resolved content must not imply that an old parent/fallback
ownership path is still present.

Retain `ssrTry`'s arm-local closures. They capture request, boundary, namespace,
ID, native-read and serial checkpoints and release them with the synchronous
call. Shared mutable scratch would permit reentrant arms to overwrite each
other; a top-level helper decomposition would need those values passed or
stored in another environment record. The measured size alone does not justify
that replacement. The diagnostic workload shows that size does not prevent
optimizing compilation on the measured engine.

### Response rope, document classification and output assembly

The flattening mechanism is reproduced, not dismissed. `strings.mjs` captures
the actual production renderer body in V8 heap snapshots. Before
`isDocumentRoot`, the 73,563 UTF-16-unit response contains 1,183 reachable cons
strings; after classification it contains one cons root over flat storage.
A second snapshot before classification leaves the graph unchanged, controlling
for the observer. The document prefix creates a 73,578-unit transport string;
UTF-8 encoding flattens that wrapper again. Node transport and Web TextEncoder
produce identical complete 73,834-byte output, including escaped and non-ASCII
text. This is engine-specific representation evidence, not an application
timing result.

Retain the current string output and combined shell. A `startsWithHtml` flag
would need provenance carried through dynamic components, fragments, trusted
HTML, and compiled string concatenation; an arbitrary component can produce its
root at runtime. A prefix-only chunk removes a wrapper flatten but adds a
transport write and another backpressure boundary, while head insertion,
ViewTransition processing, stream carrier escaping, and UTF-8 encoding still
consume the output. No net benefit for that protocol change was established.
The current design keeps accepted-shell ordering and injection/drain-before-
`allReady` behavior without introducing metadata across every SSR node.

### Oversized SSR functions

`diagnostics.mjs` exercises 128 descriptor hosts and Suspense boundaries for 300
rounds, plus static, pending and rejected controls. A separate coverage process
proves execution. Diagnostic exports retain actual function references, and
bytecode/optimization events are matched to their SharedFunctionInfo addresses,
not just names. A separate unchanged public entry supplies the clean size
control; the diagnostic export graph is not a production size claim.

| Function | Bytecode bytes | Naturally observed tiers |
| --- | ---: | --- |
| `ssrTry` | 3,098 | Maglev, TurboFan |
| `ssrAttr` | 1,598 | Maglev, TurboFan |
| `ssrHostElement` | 1,292 | Maglev, TurboFan |

No optimization was forced. A later pending/error shape can invalidate warmed
code; reaching a tier is not proof of constant optimization or throughput.
Keep these function boundaries and their established ownership/serialization
contracts. Attribute and host alternatives are evaluated separately in
[the metadata audit](../ssr-final-metadata/README.md).

## Correctness, lifetime and self-review

- Three nearby files pass 204 tests across development/production projects:
  `ssr-stream-state-regressions`, `ssr-render-phase-state`, and `streaming-ssr`.
- A new two-wave sibling test fails in both modes if the pending scan returns
  after seeing the first completed boundary: the stream ends prematurely.
- A new three-wave resource test preserves revealed CSS, discards resources
  from completed fallbacks, restores IDs, and keeps final DOM content. Aliasing
  the live CSS Map fails both modes by losing the accepted stylesheet.
- The benchmark also rejects live snapshot aliasing, missing lazy-thenable
  probes, and one shared hook-position record. Its resource retry and settled
  twin must agree on complete output.
- The scans cross no user callbacks. No persistent cache/index/counter is added.
  Collection snapshots remain immutable until existing pass/request cleanup;
  callback, recorder and signal observation lifetimes are unchanged.

The [recorded evidence](./measurements.json) contains baseline/candidate work,
V8 function diagnostics and rope observations. It distinguishes retained work
from removed copies, and does not present source-line reduction, JIT tier
selection, or benchmark observer calls as a speed measurement.
