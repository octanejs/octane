# Compiled TSRX performance follow-up

The corrected source has one-read `@{}` prop-update point estimates close to both
baselines, but all four primary 95% intervals include 1. The earlier reported
28.6% slowdown was not reliably reproduced. These results establish neither a
wall-time speedup nor zero overhead. Retaining the small optimization trades a
few compressed bytes in the compiled native fixtures for less repeated collector
bookkeeping; the timings do not establish an overall performance win.

The table reports final/baseline paired geometric wall ratios and 95% intervals.
`422c2c93` is the version before this follow-up; `cd9ed337` is the earlier
consolidation baseline. Each column is a separate process, with 25 pairs and
10,000 updates per block. All output, identity, native-update, and unchanged-source
checks passed.

| TSRX prop case | vs 422c, run 1 | vs 422c, run 2 | vs cd9, run 1 | vs cd9, run 2 |
| --- | ---: | ---: | ---: | ---: |
| Unread, collection off | 0.938 [0.767, 1.147] | 1.015 [0.964, 1.069] | 0.923 [0.790, 1.080] | 0.986 [0.956, 1.017] |
| Unread, collection on | 1.104 [0.973, 1.253] | 1.008 [0.967, 1.050] | 0.985 [0.916, 1.060] | 1.004 [0.960, 1.051] |
| One read | 0.997 [0.839, 1.185] | 0.965 [0.916, 1.016] | 0.962 [0.887, 1.043] | 0.998 [0.963, 1.035] |
| 16 repeated reads | 1.012 [0.879, 1.164] | 0.956 [0.908, 1.007] | 0.985 [0.884, 1.098] | 1.029 [0.927, 1.143] |
| 16 distinct reads | 1.012 [0.831, 1.232] | 1.031 [0.984, 1.079] | 0.990 [0.911, 1.075] | 1.019 [0.996, 1.043] |

Raw final results: [422c run 1](parity-focused-vs422-01.json),
[422c run 2](parity-focused-vs422-02.json), [cd9 run 1](parity-focused-vscd9-01.json),
and [cd9 run 2](parity-focused-vscd9-02.json). The latest direct-cd9 one-read
absolute means were 3.908 µs baseline and 3.902 µs final. Absolute means across
runs varied substantially. Even the byte-identical collection-off control in
both 422c comparisons had wide wall intervals, so small point differences are
not reliable speed claims. CPU and main-thread CPU samples and GC overlaps remain
in each JSON as diagnostics; none replaced wall samples or removed outliers.

The [full mixed runner](parity-native-costs.json), against `cd9ed337`, also passed
all controls across 42 measured cases, two warmups, and nine samples. Its one-read
TSRX prop-update point ratio was 1.187, with baseline/final relative margins of
error of 17%/28%.
That noisy mixed result is retained, not overridden by the focused runs. Mount,
signal-update, unmount, SSR, repeated/distinct-read, and ordinary return-JSX
controls remain in that file; this follow-up makes no return-JSX optimization claim.

The same full run measured the supplementary collector microcases below against
cd9. Values are arithmetic means in µs per collection cycle with 95% relative
margins of error (RME). These short protocol loops are not whole-render costs.

| Collector case | Baseline µs (RME) | Final µs (RME) | Point ratio |
| --- | ---: | ---: | ---: |
| empty | 0.0589 (13.2%) | 0.0476 (7.7%) | 0.808 |
| repeated | 0.2469 (18.5%) | 0.2510 (19.9%) | 1.017 |
| distinct | 0.2539 (17.2%) | 0.3174 (39.4%) | 1.250 |
| nested-witness | 2.7475 (11.7%) | 2.6760 (11.0%) | 0.974 |
| replay | 0.2719 (23.0%) | 0.2658 (24.3%) | 0.977 |

Empty collection has a lower point estimate; repeated, distinct, witness, and
replay costs vary and have substantial uncertainty. This is not a blanket
collector speedup. The [separate untimed controls](parity-collector-controls.json)
pass on the current helper and fail independently when either observer restoration
or write-guard eligibility is deliberately broken. They also run before full-runner
warmups in separate bundles, leaving measured exports and loops unchanged. The
[preformat check](parity-collector-controls-preformat.json) retains its original
helper hash rather than being relabeled as current bytes.

All seven [selected public-entry bundles](parity-bundles.json) are byte-identical
to the retained 422c consolidation bundles. Compiled native-read fixtures are
different: each of the three client `@{}` read cases grew by 50 raw / 25 gzip bytes,
and the unread native client fixture grew by 74 raw / 47 gzip bytes. The server
counterparts grew by 29 raw / 16 gzip bytes per read case and 53 raw / 28 gzip
bytes for unread collection. The unread collection-off client fixture is
unchanged. These are measured fixture costs, not incremental size guarantees
for arbitrary applications.

The final [1,000-cycle foreign-value retention run](parity-foreign-retention.json)
used the same engine bundle as the earlier run. At all five checkpoints it found
zero retired cycle scopes or signals; intentionally live scopes were 2, 2, 2, 1,
and 0. The [earlier backlink fault](consolidation-foreign-retention-fault.json)
remains the negative control. This checks the authored engine ownership workload,
not native DOM, browser, async, historical-frame, or DevTools retention. The final
broader correctness evidence is recorded separately in [parity-correctness.json](parity-correctness.json).

No earlier result was discarded. The [unchanged full reproduction](parity-reproduce-native-costs.json)
and [unchanged focused reproduction](parity-focused-baseline.json) were noisy.
The first edit then passed focused collection checks but failed 18 broader
deferred-value checks. Its [422c comparison](parity-focused-rejected-vs422.json)
and [cd9 comparison](parity-focused-rejected-vscd9.json) are rejected-candidate
diagnostics, including the narrower interval in the latter; they cannot support
claims about the corrected implementation.

Reproduction uses [run-native-props.mjs](../../run-native-props.mjs) with immutable
archives and the same explicit settings shown in the [suite README](../../README.md).
Run twice against each baseline into fresh output files. The exact measured
commands, dependency versions and hashes, source hashes, and all sample values
are retained in the JSON files. The selected supplemental source compiler was
already authorized; these runs are not locked-workspace or canonical CI gates,
and happy-dom measures no browser layout, paint, or frames.

The [harness provenance](parity-harness-provenance.json) distinguishes the original
full runner (`93e81c…`), original temporary focused runner (`833b7c…`), and
repository focused runner (`5b6e57…`). The [exact temporary source](parity-focused-original-runner.mjs.txt)
is archived as text to preserve its bytes; use the repository runner for new
runs. Twenty-four helper/order expressions and three full warmup/measured loops
produce identical normalized code. Both [original](parity-focused-original-smoke.json)
and [repository](parity-focused-durable-smoke.json) smoke runs rebuilt all ten
archived renderer bundles byte for byte. All five final renderer bundles also
match across the four focused runs and the full runner.

The [evidence manifest](parity-evidence-manifest.json) records raw and published
file hashes. Public copies omit process-resource snapshots and free-memory
metadata, retain host load averages, and preserve every wall/CPU/GC sample. No
raw process listings or heap snapshots are published.
