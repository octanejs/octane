# View Transition parity performance evidence

## Effect cleanup after a completed transition

The cleanup comparison starts from `ead781345500f7245d9efbb076cdfc2313b474eb`,
which includes main `1198cdc6c14e44ef7c63e6f2e77948f13048b2a3`. It isolates this
follow-up from the earlier changes below. Exact source, compiler, fixture,
dependency, harness and asset hashes are in
[effect-cleanup.json](measurements/effect-cleanup.json). The final package hash is
`0b260f33…`; the baseline package hash is `3e715763…`.

The optional driver remains installed after a ViewTransition finishes. Ordinary
deletions were still entering `stageTeardown`, which immediately returned because
no staged capture existed. Cleanup and deactivation now check the active capture
before calling the driver. Capture creation initializes the driver before
publishing the capture. During preparation, teardown and deactivation keep their
existing ordering, journaling and rollback behavior, including effect slots that
have no cleanup callback. There is no new cache, allocation or retained state.

The benchmark uses the original effectful-list TSRX and JSX fixtures and their
exact lifecycle oracle. Each operation runs in a fresh browser context, either
after ordinary root setup or after a real native transition has completed and
its root has been removed. Both modes load identical feature-containing assets.
The benchmark verifies the browser's executed script bytes and counts outermost
function entries with Chromium precise coverage and JIT disabled.

| Operation after a completed transition | TSRX before → after | JSX before → after | Calls removed in each |
| --- | ---: | ---: | ---: |
| Clear 1,000 rows | 51,101 → 49,101 | 62,127 → 60,127 | 2,000 |
| Remount 1,000 rows | 159,097 → 157,097 | 203,123 → 201,123 | 2,000 |
| Remove 100 scattered rows | 43,192 → 42,992 | 65,018 → 64,818 | 200 |

All removed calls are inactive `stageTeardown` entries. The six cold-control
counts are unchanged: TSRX 47,089 / 155,085 / 42,780 and JSX
57,115 / 198,111 / 64,506, in table order. This is a reduction in measured
function calls, not a CPU or application-latency claim. Remaining idle-minus-cold
work is 2,012 / 2,012 / 212 calls for TSRX and 3,012 / 3,012 / 312 for JSX;
the installed driver still has other lifecycle work. These controls do not
measure a bundle that excludes ViewTransition.

The three guards add 23 raw JavaScript bytes to each combined fixture build:
TSRX 248,244 → 248,267 bytes, JSX 248,122 → 248,145. Sum-of-asset gzip sizes
are 79,319 → 79,322 bytes and 79,340 → 79,345 respectively (+3 / +5 bytes).
Compiler and compiled fixture hashes match between baseline and candidate.
No server or compiler implementation changes are part of this follow-up.

The new Chromium CI check requires zero inactive `stageTeardown` calls, bounds all asset
function calls and bounds the difference between idle and cold controls. Its
18 total/delta guards allow 32 calls above the measured result, less than one
extra helper call for each of the smallest 100 removed rows. Baseline semantics
pass, but all six idle cases fail the new work budgets; the final candidate
passes all 30 guards, including 12 zero-call checks. The registered suite passes
all 43 guards. Shared lifecycle assertions remain in the canonical effectful-list
timing runner, whose original six operations also pass in both dialects with
one sample per operation; that smoke run is not a timing comparison.

Correctness validation passes 534 focused development/production tests and 89
native browser cases, plus strict runtime/TSRX fixture types and 72 staged-DOM
checker/workflow tests. New observations cover cleanup exactly once, connected
DOM during synchronous deletion cleanup, Activity disconnect/reconnect and
native urgent-abort cleanup. Deliberately bypassing staged teardown makes the
held-update tests fail; incorrectly suppressing ordinary cleanup makes the
ordinary deletion and Activity tests fail in both modes. The Activity case
publishes deactivation after preparation; it does not independently establish
coverage of deactivation during a still-suspended retry.

Environment: Node 24.20.0, Chromium 149.0.7827.55, Playwright 1.61.1, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.2.0, @tsrx/oxc 0.13.0, macOS arm64. Both variants
use the same dependency installation and final harness. These deterministic
counts do not establish changes to CPU time, allocation/GC, active transition
latency or native DOM work. Reproduce with:

```sh
# Expected to fail the new work budgets while retaining passing lifecycle checks.
BENCH_JSON=/tmp/vt-cleanup-before.json node benchmarks/view-transitions/effect-cleanup.mjs --octane-revision=ead781345500f7245d9efbb076cdfc2313b474eb
BENCH_JSON=/tmp/vt-cleanup-after.json node benchmarks/view-transitions/effect-cleanup.mjs
node benchmarks/bench.mjs --quick --ratios view-transitions
```

## Ordinary client regression and fix

The ordinary table workloads exposed a regression that the smaller root controls
missed. Compare main `bb11d0b3e`, reviewed PR `ab2c29e65`, and the final source/asset
hashes in [js-framework-regression.json](measurements/js-framework-regression.json).
After measurements, main advanced to `fe1b2b7e6` with a style-spread compiler
optimization, merged in `b891b99f6`. The current package hash is `9176bbd8…`;
the timed implementation is `45aa6f0d…`. The separate
[js-framework-main-equivalence.json](measurements/js-framework-main-equivalence.json)
retains both source histories and confirms all four canonical assets (main/final
× TSRX/JSX) remain byte-identical, with identical compiled fixture inputs.
The original measurements keep their historical hashes. Post-merge guard timings
run concurrently with correctness work and are not interpreted.

This section supersedes the client-byte observations in the historical sections.
The report retains complete canonical outputs, failure controls, focused raw
samples, source/fixture/compiler/dependency hashes, and alternate implementations.

### Deterministic work

Both actual `benchmarks/js-framework` applications import ordinary root/state
APIs and do not install ViewTransition. Production builds remove the optional
transition driver and DOMStage class, but the reviewed identity receiver helper
remained reachable. It ran 12,006 times in the TSRX mount and 14,046 in JSX.
Driver exclusion alone therefore did not establish an inexpensive ordinary path.

| 1,000-row mount calls | Main | Reviewed PR | Final | Unchanged maximum |
| --- | ---: | ---: | ---: | ---: |
| TSRX | 34,083 | 46,090 | 34,088 | 35,000 |
| JSX | 46,162 | 60,209 | 46,167 | 50,000 |

Local DOM receivers now select their staged view inline. Complex receivers retain
single evaluation before stage selection; twelve immediate local captures remove
per-row insertion helper calls without spanning component callbacks. The typed
checker validates the actual stage binding and matching identifier receivers.
No prepared receiver is cached across user code.

The final counts reproduce exactly in both balanced runs. Original row output,
identity, insertion, fragment, delegated-event and selection gates all pass.
The unchanged canonical harness rejects both reviewed builds in a separate
failure control. PR Chromium CI now runs this same harness with one timing
sample, both canonical target names and both existing call ceilings, and uploads
its report. CI gates correctness and work counts; its single timing sample is
not a performance comparison.

### Event updates and timing

Fixing mount calls alone left a repeatable JSX selection slowdown. The first
canonical comparison prompted a focused check with 40 warmup actions and 80
samples for each operation, in four independent browsers ordered
main–candidate–candidate–main. Selection alternates two rows; swaps always change
order. Every action checks all retained row identities and the selected class.
The diagnostic copies the canonical click/commit boundary, including `gc()`
before timing and awaited `__benchFlush` inside timing. It records every sample.

The receiver-only candidate's selection medians were **0.50/0.55 ms**, against
**0.30/0.40 ms** for main. Precise coverage showed only 9,176→9,177 calls for
selection and 9,173→9,178 for swapping, so the extra mount helper calls did not
explain this remaining cost. Each selection refreshes 2,000 event bundles;
the reviewed helper reassigned each bundle through an optional projection call.

The final helper projects only during an active staged capture. Capture creation
initializes the driver first; when capture is absent its projection already
returns the original bundle. A direct conditional avoids ordinary self-assignment
and also skips idle projection calls after the driver has been installed.
Projection still precedes dispatch snapshots and transaction journaling.

| Focused median, ms | Main A1 | Final B1 | Final B2 | Main A2 |
| --- | ---: | ---: | ---: | ---: |
| JSX selection | 0.30 | 0.35 | 0.30 | 0.40 |
| JSX swap | 0.50 | 0.50 | 0.50 | 0.60 |

The previous repeatable increase is absent in this comparison. Distributions
overlap main, so no speedup is claimed. The final production assets match the
measured capture-guard prototype byte-for-byte. The complete canonical workloads
also run again on final source, with three warmup cycles and eight samples per
operation in each of four balanced runs. Its original JSON retains per-run
score, mean, median, min, p95, standard deviation and RME, but not individual
sample values. Those summaries are not pooled into invented sample distributions.
Its short JSX selection scores remain 0.34/0.34 ms versus main's 0.22/0.28
(medians 0.30/0.40 versus 0.30/0.30). The longer warmed comparison does not
reproduce this smaller difference; early-run effects are not conclusively excluded.

These are local synchronous click/commit timings, excluding paint, not official
js-framework-benchmark Chrome timeline scores. Short-action timer quantization,
JIT behavior and browser-process variation limit precision. Startup, heap/GC,
active large-tree transition latency and official benchmark scores are not measured.

### Bundle and native controls

| Canonical JS gzip bytes | Main | Reviewed PR | Final | Final − main |
| --- | ---: | ---: | ---: | ---: |
| TSRX | 32,273 | 32,858 | 33,040 | +767 (2.38%) |
| JSX | 60,228 | 61,075 | 61,653 | +1,425 (2.37%) |

Final raw JavaScript is 99,795/194,694 bytes, versus main's 96,612/187,384.
The fix adds 182/578 gzip bytes versus the reviewed PR. Inline checks remove
function calls, but retain branches and shared code; this is not zero overhead.

| Other fixture | Reviewed raw → final | Reviewed gzip → final |
| --- | ---: | ---: |
| Ordinary static root | 166,474 → 171,732 | 53,663 → 54,126 |
| Ordinary stateful root | 174,676 → 180,012 | 56,565 → 57,070 |
| Document transition | 323,705 → 331,713 | 90,415 → 91,196 |
| Element scopes | 320,533 → 328,267 | 89,380 → 90,001 |

All native semantic observations and capture/rectangle/computed-style counts
remain unchanged. Ordinary controls still exclude the optional driver/adapter
and perform no captures or geometry/style reads. Server runtime is unchanged
by this follow-up. No new per-node cache, projection allocation or retained state
is introduced on the ordinary path.

Rejected alternatives are retained in the evidence. A helper-arm ternary kept
more bundle bytes; a direct DOM ternary and a driver-guarded event assignment were
built but not selected or assigned a CPU benefit. The active-capture event guard
addresses the measured hot operation while also avoiding idle driver calls.

Final strict core types, 85 native browser tests, 74 event/dispatch tests in
both compilation modes, and 72 checker/workflow tests pass. The preceding
receiver implementation passed all 18,280 local core tests. Its public host-state
control passes, while replacing the inline receiver with a native node makes
both modes fail before the native callback publishes. Full repository and React
parity coverage run in PR CI.

Environment: Node 24.20.0, Chromium 149.0.7827.55, Playwright 1.61.1, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.2.0, @tsrx/oxc 0.13.0, macOS arm64. Timed comparisons
run sequentially after other agent-owned test/build workloads finish. Main and
candidate use identical fixture/compiler inputs, dependencies and production
options. Reproduce the canonical comparison with the README's
`js-framework.mjs` commands; the focused diagnostic source is retained in the report.


## Second review: large-page SSR and scope fixes

The final runtime comparison uses reviewed head `759330f3`; the client baseline
`c7b523571` merges that runtime with main `bb11d0b3e` so both client builds use
the same updated compiler. All measured source, fixture, dependency and asset hashes,
raw timing samples, semantic observations, and rejected intermediate SSR runs
are in [review-round-two.json](measurements/review-round-two.json).

After timing, CI exposed a constructor parameter property unsupported by Node's
strip-only TypeScript loader. An explicit field and constructor assignment fix
that syntax. Historical measured hashes remain unchanged in the reports;
[server-strip-only-equivalence.json](measurements/server-strip-only-equivalence.json)
records the corrected source hash, byte-identical minified and unminified server
transforms, and a verification run whose complete SSR bundle matches the measured
asset exactly (`d29b4457…`, 612,914 raw / 38,286 gzip bytes). All 22 benchmark
outputs pass, the six register-hook regressions turn green, and strict core types
pass. The existing timing results therefore describe the same emitted JavaScript.

Environment: Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5, esbuild 0.28.1,
@tsrx/core 0.2.0, @tsrx/oxc 0.13.0, Playwright 1.61.1, macOS arm64. SSR timings
were serialized with other agent-owned workloads. Both variants use the same
compiled fixture, production options, warmup policy and alternating paired runs.

### SSR scaling

The old two-host fixture missed the whole-document tag walk. New controls have
200 or 1,600 unrelated four-host rows around one tiny boundary, with matching
plain pages and a separate trusted-HTML page. Their emitted page bytes agree
exactly between revisions, including the final row link and authored text.

| Scenario | Reviewed median µs | Final median µs | Final / reviewed |
| --- | ---: | ---: | ---: |
| Plain | 0.362 | 0.351 | 0.971× |
| View | 2.458 | 1.992 | 0.810× |
| PlainStream | 26.016 | 27.282 | 1.049× |
| ViewStream | 28.840 | 30.586 | 1.061× |
| ScopedView | 5.111 | 3.832 | 0.750× |
| ScopedViewStream | 37.006 | 34.600 | 0.935× |
| PlainPage | 8.642 | 8.184 | 0.947× |
| ViewPage | 139.350 | 22.108 | 0.159× |
| PlainLargePage | 201.935 | 197.192 | 0.977× |
| ViewLargePage | 1220.954 | 310.027 | 0.254× |
| ViewRawPage | 133.401 | 82.955 | 0.622× |

The 24.6 KB page improves by 84%; the 197 KB page improves by 75%. Cached native
suffix searches restrict replacement to segments containing candidates and skip
opaque script/comment bodies. Ordinary pages avoid the tag parser, including
`overflow-x-auto` false positives. The stream median difference tracks the plain
stream control and overlapping distributions; no stream speedup is claimed.

A second paired run against the earlier implementation `e36dec2b4` verifies that
the large-page regression is removed: 24.6 KB is 20.707 → 19.718 µs, and 197 KB is
298.967 → 285.458 µs. Document streaming is 27.201 → 27.287 µs while its plain
control is 19.597 → 19.689 µs. These small differences do not establish a speedup
over that earlier implementation.

There is a deliberate remaining cost for trusted HTML: its 24.6 KB control is
15.070 → 80.078 µs versus the earlier unsafe regex. The quote-aware parser preserves
adjacent attributes, raw-text bodies, duplicate names, and attribute-looking
strings. It is faster than the reviewed parser (133.401 → 82.955 µs), but this
does not remove its traversal cost. The tiny document case remains 1.181 → 1.764 µs
versus `e36dec2b4`. Raw-only branded values preserve parsing provenance across
memoized and async retries; ordinary values retain their existing representation
and consumption path, with one added branch when creating a branded value.

The combined server fixture bundle grows 611,336 → 612,914 raw bytes and
37,486 → 38,286 gzip bytes versus `759330f3` (+800 gzip bytes). That asset includes
all page fixtures; it is not a minimal server import size.

### Client and adapter controls

| Fixture | Reviewed raw → final | Reviewed gzip → final |
| --- | ---: | ---: |
| Ordinary static root | 166,474 → 166,474 | 53,663 → 53,663 |
| Ordinary stateful root | 174,676 → 174,676 | 56,565 → 56,565 |
| Document transition | 323,694 → 323,705 | 90,391 → 90,415 |
| Element scopes | 320,522 → 320,533 | 89,337 → 89,380 |

Ordinary fixtures still exclude the optional driver and adapter, with zero
capture, rectangle and computed-style reads. All positive native observations
and read/capture counts agree. Adapter operation counts remain identical; its
new fresh-insert guard adds one `Map.has` without new retained state or allocation.
These counters and bytes do not measure whole-application latency or GC.

Reproduce with the README commands: use `--octane-revision=759330f3` for SSR,
`--octane-revision=e36dec2b4` for the earlier SSR reference, and
`--octane-revision=c7b523571` for client/scopes. Omit the revision for candidate
client/scopes; the SSR runner always pairs its selected baseline with the checkout.
The SSR report records each fixture's repetitions and five warmup batches followed
by 11 alternating samples. Concurrency, backpressure, allocation/GC, browser paint
and active large-tree client latency remain outside these measurements.

## First review feedback (historical)

Compared the reviewed head `e36dec2b41d61bf5c0ea118b98565fc30f7b94ce` with the
feedback implementation. Raw reports identify exact source revisions and package
hashes in [review-feedback.json](measurements/review-feedback.json). These results
supersede the historical comparisons below.

The environment remains Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71 and Playwright 1.61.1 on macOS arm64. Each
paired runner uses identical authored fixtures, dependencies and build settings.
Byte/work measurements run both clean minified and observed readable assets,
with the same public output, retained-node and native-capture observations.

### Bundle bytes and native work

| Fixture | Reviewed raw → candidate | Reviewed gzip → candidate | Gzip delta |
| --- | ---: | ---: | ---: |
| Ordinary static root | 168,394 → 166,474 | 53,774 → 53,663 | −111 B |
| Ordinary stateful root | 176,596 → 174,676 | 56,723 → 56,565 | −158 B |
| Document transition fixture | 322,644 → 323,694 | 89,670 → 90,391 | +721 B |
| Scoped transition fixture | 317,647 → 318,636 | 88,076 → 88,750 | +674 B |

Compared with main, the ordinary static/stateful gzip sizes remain +886/+903 B;
removing the scope style hooks reduces their earlier shared cost.

Ordinary controls still exclude the transition driver/DOM adapter and perform
zero native captures, rectangle reads and computed-style reads. The two positive
fixtures include their observation code; these are comparable fixture sizes,
not minimal framework import sizes. Correctness repairs and the new adapter
state increase positive fixture bytes despite the shared-path reductions.

Four document updates retain 8 rectangle reads and 4 captures; computed-style
reads fall 28→24. For single/sibling/nested/mixed scoped batches, rectangle reads
stay 4/8/8/14 and total captures stay 1/2/2/4. Computed-style reads fall
22/44/44/71→20/40/40/64. Removing unused old clip reads explains this reduction;
post-layout clip behavior remains covered. Counters include fixture observations.

### Ordinary styles and staged large-tree work

All ten ordinary style modes × four operations retain identical semantic and
work counts against main `277c10c3f`. The scope lease hooks and their scanner
accommodation are removed. Main/candidate minified style assets are
115,862/117,064 raw bytes and 36,957/37,601 gzip bytes (+644 gzip B). Both exclude
the optional transition driver and DOM adapter.

The complementary native adapter workload compares the maintainer's interim
fix `5c3823293` with the candidate. For 1,024 retained rows plus 1,024 appends and
a full-parent clear, copied sibling slots fall 3,672,576→0 and searched slots
2,100,224→0. Publishing the full-parent clear changes 2,048 native removals into
one clear. At 256 rows the same result holds. A 24-radio group on a page with
1,024 unrelated hosts reduces imported projection nodes 51,694→1,102, while
retaining form associations, checked state and original result identities.
Template freshness scanning eliminates 3,084 child-list reads in its 1,024-subtree
case. Raw counters and hashes are in
[dom-stage-feedback.json](measurements/dom-stage-feedback.json).

These are scoped work measurements, not end-to-end active-render latency or
heap-allocation measurements. The bulk-clear case isolates full-parent clearing;
journaled shared-row parking still performs its required per-row work. Document
mutation observers still collect unrelated commit writes, and owner lookup is
recomputed across phases to preserve portal/scope invalidation. A driver that
has been installed can stage an all-transition batch even with no currently
mounted boundary, to discover newly entering boundaries. No cost elimination
is claimed for those paths.

### Ordinary client timing

The existing branch control compares main `277c10c3f` with the feedback client
runtime in `9aa4d7621`. Both builds use the same authored and compiled fixture
hashes, with no active ViewTransition. A quiet Chromium run alternates 30 paired
samples after 4,096 warmup updates, using 4,096 updates per sample.

| Mode | Main median µs | Candidate median µs | Main range µs | Candidate range µs |
| --- | ---: | ---: | ---: | ---: |
| Stable host updates | 12.280 | 12.354 | 11.938–14.966 | 12.012–13.818 |
| Toggled host updates | 16.821 | 17.139 | 15.601–23.486 | 16.211–24.048 |
| Absent branch | 0.610 | 0.610 | 0.562–0.806 | 0.586–0.757 |

Final output, retained button count and effect/cleanup lifetimes agree. The
observed distributions overlap; these small median differences do not establish
an ordinary-render latency change. This control does not measure active staged
transitions, mount cost, browser paint or allocations. Its minified fixture is
196,544→198,422 raw bytes and 60,371→61,268 gzip bytes; shared host routing still
has a bundle cost against main. Raw timings, bundle hashes and preparatory build
metadata are included in the review record; preparatory one-sample timings are
not used for conclusions.

Reproduce byte/work comparisons with the commands in [README.md](README.md),
using `--octane-revision=e36dec2b4` for the reviewed baseline and omitting the
revision for the candidate. Both scope revisions support the semantic oracle,
so leave `VT_SCOPES_BYTES_ONLY` unset. For ordinary style controls, retain main
`277c10c3f` as the baseline. Build the branch fixtures with `branches.mjs` and
`BRANCH_BUNDLE_DIRECTORY`, then run:

```sh
BRANCH_BROWSER_SAMPLES=30 BRANCH_BROWSER_CYCLES=4096 BRANCH_BROWSER_WARMUP=4096 \
BENCH_JSON=/tmp/branches-timing.json node benchmarks/client-hot-paths/branches-browser.mjs \
/tmp/baseline/branches.mjs /tmp/candidate/branches.mjs
```

### SSR review-fix comparison

`e36dec2b4` → `fc0dbf32`, Node 24.20.0, macOS arm64. Both revisions use identical compiled input and production minified bundles: five warmup batches, then 11 alternating paired batches. Ready: 50,000 warmup operations / 10,000 per sample; streams: 5,000 / 1,000. Agent-owned workloads were serialized.

| Scenario | Median µs, baseline → final | Median ratio | Paired ratio median [min–max] | Baseline p25–p75 µs | Final p25–p75 µs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plain | 0.366 → 0.374 | 1.024× | 0.994 [0.914–1.103] | 0.355–0.391 | 0.357–0.386 |
| View | 1.282 → 2.314 | 1.805× | 1.833 [1.755–2.034] | 1.249–1.302 | 2.289–2.406 |
| PlainStream | 23.182 → 21.813 | 0.941× | 0.972 [0.812–1.071] | 21.203–23.811 | 21.045–24.837 |
| ViewStream | 33.646 → 30.853 | 0.917× | 0.923 [0.858–1.056] | 31.048–35.988 | 28.696–35.670 |
| ScopedView | 7.608 → 6.003 | 0.789× | 0.808 [0.776–0.834] | 7.310–7.787 | 5.827–6.427 |
| ScopedViewStream | 47.196 → 41.833 | 0.886× | 0.843 [0.801–1.083] | 46.022–48.328 | 38.634–47.528 |

**Remaining cost:** document-ready rendering is 1.805× the reviewed baseline (+1.032 µs), slower in every pair. Quote-aware parsing still costs more than the former unsafe global-regexp removal. Scoped-ready is faster in every pair; shared CSS replaces inline-style rewriting. Plain-ready and stream distributions overlap, so their median differences do not establish a general speedup.

**Optimization evidence:** the first correctness implementation (`9aa4d762`) measured 4.687 versus 1.181 µs for document-ready rendering (3.967×). Repeated attribute scans were replaced with one deduplication pass, one removal pass, and `indexOf` for quoted values. Quote boundaries and case-insensitive, boolean, spaced/unquoted attributes remain supported. A separate paired comparison isolates the reduction:

| Scenario | Intermediate → final median µs | Median ratio | Paired ratio median [min–max] |
| --- | ---: | ---: | ---: |
| View | 5.174 → 2.438 | 0.471× | 0.470 [0.425–0.488] |
| ScopedView | 8.431 → 4.890 | 0.580× | 0.576 [0.558–0.594] |
| ViewStream | 31.497 → 27.569 | 0.875× | 0.875 [0.832–0.927] |
| ScopedViewStream | 40.689 → 34.570 | 0.850× | 0.850 [0.739–0.888] |

The intermediate comparison’s plain controls overlap: Plain 0.403 → 0.401 µs and PlainStream 20.684 → 20.626 µs.

**Noise accounting:** one final-source trial was retained but excluded: its PlainStream baseline rose to 91.384 µs, and the median ratio 1.442× conflicted with the paired median 0.895×. The table reports the single repeat with identical source/bundle hashes. Plain-ready returned to overlapping sub-microsecond distributions; streams still show spread. No further runs were selected.

| Response | Raw bytes, baseline → final (delta) | gzip bytes, baseline → final (delta) |
| --- | ---: | ---: |
| Plain | 31 → 31 (+0) | 45 → 45 (+0) |
| View | 113 → 113 (+0) | 105 → 105 (+0) |
| PlainStream | 2,443 → 2,830 (+387) | 1,040 → 1,176 (+136) |
| ViewStream | 12,621 → 13,118 (+497) | 3,925 → 4,133 (+208) |
| ScopedView | 213 → 266 (+53) | 155 → 176 (+21) |
| ScopedViewStream | 12,663 → 13,213 (+550) | 3,938 → 4,163 (+225) |

The six-scenario server bundle is 75,775 → 76,517 bytes (**+742 raw**), or 25,598 → 25,879 (**+281 gzip**). The optimization adds 255 raw/105 gzip bytes versus `9aa4d762`, with unchanged response lengths. Ready bytes include `RenderResult.css + html`; the final scoped response includes a 115-byte shared style block. Streams include CSS; transport recovery/shared helpers add 387 raw bytes to ordinary streaming. Gzip uses level 9 and varies with stream IDs. This is a fixture bundle, not a standalone runtime import.

**Limits:** small synthetic server-only cases; browser animation, resource waits, backpressure, concurrency, and allocation/GC behavior are not measured. Distributions describe batches, not individual-request latency guarantees.

Raw samples, wire counts, distributions, and provenance are in [`measurements/review-feedback.json`](measurements/review-feedback.json): `ssr.final` (reviewed baseline → final), `ssr.optimization` (intermediate → final), `ssr.intermediate` (reviewed baseline → first correctness implementation), and `ssr.noisy` (the retained noisy final-source run).

Reproduce from the final checkout with Node 24.20.0, serializing these runs with other workloads:

```sh
BENCH_JSON=/tmp/vt-ssr-final.json node benchmarks/view-transitions/ssr.mjs --octane-revision=e36dec2b4
BENCH_JSON=/tmp/vt-ssr-optimization.json node benchmarks/view-transitions/ssr.mjs --octane-revision=9aa4d762
```


## Historical element-scope comparison before review feedback

The pre-feedback implementation is compared with main `277c10c3fa80f56ef162959832dba35c1b43b32e`.
Byte and browser-work results use `4986632290779bc13466b75479ee0e92029f518b`; timing records
retain their exact source revisions below. The `elementScopes` entry in
[measurements.json](./measurements.json) contains raw counts, samples, semantic
observations and source/fixture/asset hashes. This comparison includes the whole
PR; the earlier document-parity measurements below remain historical.

Environment: macOS arm64, Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71 and Playwright 1.61.1. The same authored fixtures,
dependency installation and production settings are used for both revisions.

### Historical bundle cost

| Fixture | Raw main → candidate | Raw delta | Gzip main → candidate | Gzip delta |
| --- | ---: | ---: | ---: | ---: |
| Ordinary static root | 164,612 → 168,394 B | +3,782 B | 52,777 → 53,774 B | +997 B |
| Ordinary stateful root | 172,768 → 176,596 B | +3,828 B | 55,662 → 56,723 B | +1,061 B |
| Document transition fixture | 261,689 → 322,522 B | +60,833 B | 74,311 → 89,662 B | +15,351 B |
| Scoped transition fixture | 256,179 → 316,733 B | +60,554 B | 72,455 → 87,749 B | +15,294 B |
| Ordinary inline styles | 115,862 → 118,662 B | +2,800 B | 36,957 → 37,748 B | +791 B |

Both minimal ordinary bundles and the style fixture exclude the optional
ViewTransition driver and DOMStage. The minimal ordinary controls perform zero
rectangle reads, computed-style reads and native captures. Shared rendering
hooks still add bytes; optional exclusion does not imply zero shared cost.

The transition fixtures include their observation code and controls, so these
are not minimal framework import sizes. Main ignores the new scope prop; its
scoped fixture contributes a byte comparison only, without a behavioral parity
claim. The ordinary/document runner supplies the baseline native control.

### Native browser work

The existing four document updates remain 4 → 8 rectangle reads, 8 → 28
computed-style reads and 4 → 4 native captures. Each preserves the uncontrolled
input and its draft, current output and actual native animation.

| One scoped batch | Rectangle reads | Computed-style reads | Element captures | Document captures |
| --- | ---: | ---: | ---: | ---: |
| Single | 4 | 22 | 1 | 0 |
| Siblings | 8 | 44 | 2 | 0 |
| Nested | 8 | 44 | 2 | 0 |
| Mixed | 14 | 71 | 3 | 1 |

Minified and instrumented readable production runs agree on native owners,
fulfilled ready/update/finished promises, persistent hosts, final text and
pseudo-element animation targets. Counts include the fixture’s public snapshots
and pseudo-style observations; instrumentation delegates to the native API.
These figures do not measure capture latency, paint, allocations or large-tree
scaling.

### Ordinary style work and timing

All ten existing style modes × four operations pass and return identical
baseline/candidate property-loop, setter, component-render and CSSOM counts.
For a 1,000-row single-property literal, mount/select/change-selection/unrelated
updates issue 1,000/1/2/0 scalar setters and CSS writes. The multi-property literal
uses 1,000 grouped setters at mount, then 2/4/0 scalar setters and 2,000/2/4/0
CSS writes. The generic control performs 1,000 object diffs each time; selection
changes still cause only 2/4 CSS writes and an unrelated update causes none.
Leading-spread updates retain 2,000 previous/new property visits; their generic
and collision controls retain 4,000 in each direction. These are work counts, not
counts of every executed branch or heap allocations.

The coverage scanner now includes the object-clear loop whether its body is a
single expression or a block. All four property loops are counted on both
revisions; the clearing loop does no work in these update scenarios.

Timing used clean minified assets in baseline–candidate–candidate–baseline
order, with 20 fresh-context samples and 2 warmups per operation per run
(40 samples per variant). Other root/agent tests and browsers were stopped;
unrelated desktop activity was not controlled. These are mount and early update
times, not steady-state throughput.

Timing used `f5a43f4f15fc16da7abd258387e8e89d56dabfae`. Final candidate style
artifacts are byte-for-byte identical to those timed, including the readable
and minified asset hashes. The later portal correction is confined to active
transition grouping and does not change this ordinary workload.

| Style / operation | Main median [p25–p75], ms | Candidate median [p25–p75], ms |
| --- | ---: | ---: |
| single / mount 1k | 4.50 [4.30–4.60] | 4.45 [4.30–4.80] |
| single / select one | 1.80 [1.70–1.90] | 2.00 [1.80–2.10] |
| single / select another | 0.80 [0.70–0.90] | 0.90 [0.80–1.00] |
| single / unrelated update | 1.65 [1.50–1.80] | 1.70 [1.50–2.10] |
| multi / mount 1k | 4.60 [4.50–4.80] | 4.50 [4.40–4.80] |
| multi / select one | 1.90 [1.70–2.00] | 1.80 [1.70–1.90] |
| multi / select another | 0.85 [0.80–0.90] | 0.90 [0.80–0.90] |
| multi / unrelated update | 1.90 [1.70–2.10] | 2.00 [1.80–2.20] |
| generic / mount 1k | 5.15 [4.50–6.10] | 5.20 [5.00–6.00] |
| generic / select one | 2.30 [2.20–2.30] | 2.40 [2.20–2.60] |
| generic / select another | 1.00 [0.90–1.10] | 1.00 [0.90–1.10] |
| generic / unrelated update | 2.25 [2.20–2.50] | 2.40 [2.10–2.60] |

The single-property first-selection median is 0.20 ms higher; multi-property
first selection is 0.10 ms lower, and generic selection is 0.10 ms higher. The
overlapping distributions and changing direction across controls do not isolate
the new style hook’s latency. No speed improvement is claimed.

### Server cost

The six scenarios retain the four ordinary/document controls and add ready and
streamed element scopes. Both variants use the identical compiled fixture.
Ready renders warm up 50,000 times and use 11 paired alternating batches of
10,000; streams warm up 5,000 times and use 11 batches of 1,000. Values below
are amortized operation times, not individual request percentiles.

SSR timing used `f5a43f4f15fc16da7abd258387e8e89d56dabfae`. A final-source verify-only
run confirms identical compiled fixture, server source and bundle hashes,
including raw and gzip bytes; the client-only portal correction cannot affect
these timed server artifacts.

| Scenario | Main median [p25–p75], µs | Candidate median [p25–p75], µs |
| --- | ---: | ---: |
| Plain | 0.349 [0.328–0.364] | 0.362 [0.324–0.388] |
| View | 0.876 [0.852–0.940] | 1.195 [1.161–1.269] |
| PlainStream | 20.449 [20.226–20.707] | 20.877 [20.247–21.423] |
| ViewStream | 24.279 [23.985–24.683] | 28.898 [28.621–29.359] |
| ScopedView | 0.935 [0.931–0.943] | 5.606 [5.575–5.630] |
| ScopedViewStream | 23.575 [23.187–23.869] | 38.785 [37.728–39.524] |

Plain controls overlap. Document ready/streamed rendering and the new scoped
cases cost more in these paired batches. Scoped ready output additionally
identifies the persistent host and injects the isolation declaration. The
baseline ignores the scope prop, so the scoped timing differences include new
functionality and are not a same-behavior speed comparison.

| Scenario | HTML main → candidate | Gzip main → candidate | Inline scripts main → candidate |
| --- | ---: | ---: | ---: |
| Plain | 31 → 31 B | 45 → 45 B | 0 → 0 B |
| View | 113 → 113 B | 105 → 105 B | 0 → 0 B |
| PlainStream | 2,381 → 2,443 B | 1,031 → 1,039 B | 2,047 → 2,109 B |
| ViewStream | 2,525 → 12,621 B | 1,085 → 3,926 B | 2,105 → 12,199 B |
| ScopedView | 132 → 213 B | 113 → 155 B | 0 → 0 B |
| ScopedViewStream | 2,544 → 12,663 B | 1,094 → 3,939 B | 2,105 → 12,141 B |

Both candidate scope cases emit exactly one persistent section marked
`vt-scope="element"` and `view-transition-scope:all!important`. Scoped ready
rendering adds 81 raw/42 gzip response bytes. Streamed transitions include the
animation/coordination driver; ordinary streams remain driver-free. Response
counter values and compression context can change gzip bytes.

The combined six-scenario server bundle grows from 63,387 to
75,775 raw bytes (+12,388) and 21,820 to 25,598 gzip bytes
(+3,778). It imports ViewTransition and both server render APIs, and is
not a minimal ordinary SSR bundle. The measurements do not cover resource
waiting, backpressure, concurrent requests, allocation or GC.

Reproduction commands and scope limitations are in [README.md](./README.md).

## Historical document-parity measurements

Measured on 2026-09-14 against main
`277c10c3fa80f56ef162959832dba35c1b43b32e` and merged candidate
`7cd542853722ba38ff520507b9608b5eafb83d82`.
[Raw measurements](./measurements.json) retain source, fixture, lockfile and
bundle hashes, semantic observations, and tool versions.

Environment: macOS arm64, Node 24.20.0, Chromium 149.0.7827.55, Vite 8.1.5,
esbuild 0.28.1, @tsrx/core 0.1.71, Playwright 1.61.1. Each variant uses the same
authored fixtures, dependency installation and production settings. The bundle
runner verifies that source and fixture hashes remain unchanged during its run.

### Production bundle cost

| Fixture | Raw baseline | Raw candidate | Raw delta | Gzip baseline | Gzip candidate | Gzip delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ordinary static root | 164,612 B | 168,036 B | +3,424 B | 52,777 B | 53,726 B | +949 B |
| Ordinary stateful root | 172,768 B | 176,238 B | +3,470 B | 55,662 B | 56,658 B | +996 B |
| Active transition fixture | 261,689 B | 309,326 B | +47,637 B | 74,311 B | 86,143 B | +11,832 B |

Both ordinary bundles exclude the optional transition driver and `DOMStage`
adapter. Shared rendering hooks still add approximately 1 KB gzip; optional
reachability does not imply zero shared code cost. The active bundle includes
the full browser fixture, observation code and controls, so it is not a minimal
framework import size.

### Deterministic browser work

| Scenario and observation | Baseline | Candidate |
| --- | ---: | ---: |
| Static root: rectangle / computed-style / native capture calls | 0 / 0 / 0 | 0 / 0 / 0 |
| Stateful root: rectangle / computed-style / native capture calls | 0 / 0 / 0 | 0 / 0 / 0 |
| Four active updates: rectangle reads | 4 | 8 |
| Four active updates: computed-style reads | 8 | 28 |
| Four active updates: native captures | 4 | 4 |

The active workload preserves its uncontrolled input and draft, renders the
expected text, and completes four actual native animations. A clean minified
pass and an instrumented readable production pass have identical semantic
observations. Instrumentation delegates every call to the browser. The style
counts include the fixture's public pseudo-element observations, including
methods newly supported by the candidate; they are not framework-only counts.

The registered benchmark passes all 13 ratio guards: ordinary driver/adapter
absence and zero browser work, one native capture per completed update, and the
measured active read budgets. The repeated candidate run reproduced every byte
and operation count exactly.

```sh
BENCH_JSON=/tmp/vt-baseline.json node benchmarks/view-transitions/bundle.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
BENCH_JSON=/tmp/vt-candidate.json node benchmarks/view-transitions/bundle.mjs
node benchmarks/bench.mjs --quick --ratios view-transitions
```

### Native correctness controls

The merged candidate passes 30 browser cases across development and production
compilation. Six focused controls also pass against the final baseline: delayed
native publication, urgent interruption, and a focused editable survivor's
identity, selection and scroll during a reorder without `moveBefore`.

The original baseline fails the 20 readiness, class, ref, cleanup, interaction
and native CSS type cases. The intermediate implementation without staged DOM
commits fails the nested `update="none"` native animation oracle in both modes.
The lifecycle suite also demonstrates stale descriptor output under a targeted
receipt-invalidation mutation; the final native custom-element reentry case
checks the complete browser behavior.

### Ordinary client timing

The existing compiled-branch harness compares 32 stable branches, branches that
alternate between present and absent, and an absent-branch control. Both variants
use identical authored and compiled source hashes. Each checks current text,
attributes and event closures, surviving node identity, effect lifetime and
complete unmount cleanup.

After the local test workloads stopped and storage recovered, the clean
minified variants ran in separate pages of one Chromium process. Thirty samples
alternate variant order; each sample performs 4,096 updates after 4,096 warmup
updates per variant and mode. Preparation timings are excluded.

| Mode | Baseline median [p10–p90], µs/update | Candidate median [p10–p90], µs/update | Median delta |
| --- | ---: | ---: | ---: |
| Stable | 20.59 [17.85–21.97] | 20.72 [17.50–21.31] | +0.6% |
| Toggle | 28.36 [19.34–32.37] | 28.59 [20.29–30.76] | +0.8% |
| Absent | 0.732 [0.684–0.806] | 0.732 [0.684–0.830] | 0.0% |

The table uses the mean of the two middle samples for its medians and nearest
rank for p10/p90. Raw samples and the original harness output are retained; that
harness's `median` field uses the upper middle sample for an even sample count.

These small median differences are inconclusive. Distributions overlap widely,
and unrelated applications and jobs were present on the machine. The absent
control also varies between paired samples. No ordinary-render latency
improvement or meaningful regression is established by this run.

The branch bundle itself grows from 196,544 to 200,213 bytes, or 60,371 to
61,396 bytes gzip. This is consistent with the ordinary import cost above.

```sh
CLIENT_SOURCE_ROOT=/absolute/frozen-277 CLIENT_COMPILER_ROOT="$PWD" BRANCH_CYCLES=16 BRANCH_SAMPLES=1 BRANCH_WARMUP=16 BRANCH_BUNDLE_DIRECTORY=/tmp/vt-branches/baseline node benchmarks/client-hot-paths/branches.mjs
CLIENT_SOURCE_ROOT="$PWD" CLIENT_COMPILER_ROOT="$PWD" BRANCH_CYCLES=16 BRANCH_SAMPLES=1 BRANCH_WARMUP=16 BRANCH_BUNDLE_DIRECTORY=/tmp/vt-branches/candidate node benchmarks/client-hot-paths/branches.mjs
BRANCH_BROWSER_SAMPLES=30 BRANCH_BROWSER_CYCLES=4096 BRANCH_BROWSER_WARMUP=4096 BENCH_JSON=/tmp/vt-branches/timing.json node benchmarks/client-hot-paths/branches-browser.mjs /tmp/vt-branches/baseline/branches.mjs /tmp/vt-branches/candidate/branches.mjs
```

`/absolute/frozen-277` contains `git archive 277c10c3fa80f56ef162959832dba35c1b43b32e packages/octane`,
with its package dependency directory linked to the same installation as the
candidate. The compiler is the same for both variants.

### Server rendering and streaming

The same four small server scenarios use production minified bundles and an
identical compiled fixture. Each side warms up with 50,000 ready renders or
5,000 suspended streams, followed by 11 alternating paired batches of 10,000
renders or 1,000 streams. Other local test/benchmark workloads had stopped.
An initial short-warmup pilot showed strong JIT drift and is excluded.

These are amortized batch times, not individual request percentiles.

| Scenario | Baseline median [min–max], µs | Candidate median [min–max], µs | Median paired candidate/baseline |
| --- | ---: | ---: | ---: |
| Plain ready | 0.541 [0.455–0.683] | 0.554 [0.465–0.621] | 0.959× |
| ViewTransition ready | 1.690 [1.600–1.853] | 2.137 [1.987–2.491] | 1.272× |
| Plain suspended stream | 46.722 [39.930–76.305] | 46.691 [38.237–90.396] | 1.029× |
| ViewTransition suspended stream | 51.962 [45.532–61.251] | 63.115 [58.299–74.531] | 1.153× |

Plain ready and streaming controls overlap substantially. Their samples do not
establish a meaningful change. ViewTransition ready rendering is slower in
every paired batch: approximately +0.45 µs comparing medians, with a median
paired ratio of 1.272×. ViewTransition streaming is also slower in every paired
batch, with a median paired ratio of 1.153×. These are observed feature costs;
the candidate additionally emits the functioning streamed animation driver.
They are not application-wide throughput guarantees.

| Scenario | HTML baseline → candidate | Gzip baseline → candidate | Inline scripts baseline → candidate |
| --- | ---: | ---: | ---: |
| Plain ready | 31 → 31 B | 45 → 45 B | 0 → 0 B |
| ViewTransition ready | 113 → 113 B | 105 → 105 B | 0 → 0 B |
| Plain suspended stream | 2,381 → 2,443 B | 1,033 → 1,037 B | 2,047 → 2,109 B |
| ViewTransition suspended stream | 2,525 → 9,185 B | 1,087 → 2,972 B | 2,105 → 8,763 B |

Plain streaming adds 62 raw / 4 gzip bytes for composed-stream coordination.
ViewTransition streaming adds 6,660 raw / 1,885 gzip bytes, including the new
animation driver. Ready output sizes are unchanged. These are standalone
responses compressed at gzip level 9; counter values, HTTP compression and
compression context can affect wire size.

The combined production server bundle grows from 62,802 to 70,420 bytes
(+7,618), or 21,746 to 24,057 bytes gzip (+2,311). This fixture imports
ViewTransition and both server render APIs; it is not a minimal ordinary SSR
import size. The small server scenarios do not measure browser resource waits,
backpressure, concurrency, allocation or GC behavior. They check authored
content; full capture/DOM semantics are verified by the conformance and native
browser suites.

```sh
BENCH_JSON=/tmp/vt-ssr.json node benchmarks/view-transitions/ssr.mjs --octane-revision=277c10c3fa80f56ef162959832dba35c1b43b32e
```

The portable runner was also checked with `--verify-only`: all eight outputs
passed, and its compiled fixture, server sources, lockfile and bundle hashes
match the warmed run exactly. That verification skips timing and warmup; its
stream counters and gzip sizes can differ. Both reports are retained.

### Scope of the measurements

Staging an active transition creates inert DOM projections, maps and proxies,
then publishes the host operations once. That work is confined to active View
Transition preparation, but has real CPU and allocation cost. These byte and
read counts do not measure active-transition preparation time, paint cost,
garbage collection, heap retention, or large-tree scaling. No improvement in
those metrics is claimed.
