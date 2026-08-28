# Octane-hosted React

This suite measures the public `ReactCompat` boundary and checks that importing
ordinary Octane or `OctaneCompat` does not pull in the inverse bridge. It uses
stock React and React DOM, not the private React DOM experiment.

```sh
# Default: 1 and 100 islands, five warmups and 30 measured samples per lane.
BENCH_JSON=/tmp/octane-hosted-react.json node benchmarks/octane-hosted-react/run.mjs

# Include the 1,000-island scaling case used by the checked-in report.
REACT_COMPAT_COUNTS=1,100,1000 BENCH_JSON=/tmp/octane-hosted-react.json \
  node benchmarks/octane-hosted-react/run.mjs 30

# Build and execute just the native and OctaneCompat bundle controls.
node benchmarks/octane-hosted-react/run.mjs --bundle-only
```

The suite resolves its tools and React dependencies from the existing `octane`
workspace package. It adds no dependency or package manifest. Chromium must be
installed for the workspace's Playwright version. All generated executables live
in a temporary directory that the runner removes; only `BENCH_JSON` is retained.

The native control mounts a stateful button, clicks it, updates parent props,
checks DOM identity and state preservation, then checks effect cleanup. The
same entry is bundled against baseline commit
`874178645e8b3398e8898359f0537f7345b62234` and the candidate worktree. The baseline
loader reads each Octane source file directly from Git; dependencies, fixture,
public export resolution, package side-effect metadata, production defines,
esbuild version, and build options stay fixed. `REACT_COMPAT_BASE` can select a
different baseline. The fixture uses public APIs with explicit hook slots, so
the baseline does not depend on the candidate compiler.

The `OctaneCompat` control is a library entry with only `react` and the exact
bare `react-dom` specifier externalized. **`react-dom/client` is not
externalized.** A consuming browser verifier supplies a real React DOM root,
renders the emitted library, checks an update preserves the button, and verifies
cleanup. This keeps the consuming root's legitimate React DOM dependency out of
the measured library. esbuild's emitted module contribution metadata, rather
than a string search, must show no retained `ReactCompat` implementation or React
DOM client. The native entries must contain neither React nor `octane/react`.

For timings, the same real React counter runs in two lanes:

- `direct-react-roots`: one React root per host, with the surrounding host DOM
  created directly.
- `react-compat`: one Octane root with compiled, keyed
  `<ReactCompat><Counter /></ReactCompat>` boundaries, each owning one React root.

Both lanes produce the same element topology and markup (excluding Octane's
comment markers), preserve the same local state and DOM identities across a
parent update, and must perform exactly one ref/effect setup and cleanup per
counter. Every warmup and measured sample verifies these conditions. Mount,
all-counter click updates, parent prop updates, and unmount are timed until
their actual DOM/effect/ref observations complete. Completion is driven by
notifications and a MutationObserver; the ten-second timer is only a failure
deadline. Observation callbacks coalesce in a microtask so they do not scan
the whole tree once per ref or effect. The timings include scheduling and
observation overhead; they do not measure layout or paint.

Five paired warmups precede 30 paired samples at each size. Lane order alternates
each pair. Production bundles run in the same headless Chromium page with origin
isolation enabled for higher-resolution timers. There is no forced GC, React
`act()`, timer sleep, CPU throttling, or timing threshold. Reports include all raw
samples and mean, median, minimum, p95/p99, standard deviation and 95% relative
margin of error. The headline is the arithmetic mean of all measured samples;
no late-window selection or outlier removal is applied.

The checked-in [results.json](./results.json) is a local measurement on
2026-08-28: Apple M5 Max, macOS arm64, Node 26.4.0, Chromium 149.0.7827.55,
React/React DOM 19.2.7, esbuild 0.28.1. It records the candidate Git head and dirty
paths, generated artifact hashes, aggregate input-source hashes, and contributing
modules. It describes that worktree snapshot, not an assertion that later source
changes have been measured. The client measurements were refreshed after the
Suspense overlap, Activity cleanup-error, and distribution import fixes.

| Bundle control | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Native baseline | 141,428 | 45,886 | 40,164 |
| Native candidate | 141,428 | 45,886 | 40,164 |
| Native delta | 0 | 0 | 0 |
| OctaneCompat-only library | 167,781 | 54,491 | 47,503 |

The native baseline and candidate have the identical SHA-256
`baff62c799a5167fa859c1f1f5b4411d4076ecf91ae2da7f4a1a3e94f5b06a9b`.
The emitted-module and executable semantic checks pass for all three controls.
These are totals for these fixtures, not the marginal size of either bridge.

Values below are mean milliseconds ± the 95% relative margin of error of that
lane's sample mean. The JSON also contains medians and the full distributions.

| Islands | Lane | Mount | Local update | Parent update | Unmount |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Direct React roots | 0.089 ± 15.6% | 0.029 ± 8.1% | 0.015 ± 11.4% | 0.014 ± 8.7% |
| 1 | ReactCompat | 0.166 ± 6.6% | 0.034 ± 7.5% | 0.050 ± 8.8% | 0.025 ± 11.9% |
| 100 | Direct React roots | 2.583 ± 5.0% | 0.521 ± 2.4% | 1.003 ± 10.0% | 0.213 ± 5.3% |
| 100 | ReactCompat | 3.855 ± 14.2% | 0.674 ± 7.5% | 1.482 ± 11.7% | 0.348 ± 4.8% |
| 1,000 | Direct React roots | 36.120 ± 6.3% | 7.520 ± 32.2% | 67.334 ± 8.9% | 6.258 ± 5.2% |
| 1,000 | ReactCompat | 54.455 ± 8.6% | 8.436 ± 6.7% | 67.906 ± 7.1% | 8.083 ± 5.1% |

The boundary adds measurable mount, update, and teardown cost. A thousand
independent roots is expensive in both lanes and should not be treated as a
cheap replacement for a single React tree. The direct lane deliberately has the
same number of roots; this is a compatibility-overhead comparison, not an
Octane-versus-React framework benchmark or a speedup claim. Tiny one-island
timings and local-machine measurements need particular care in interpretation.
The ready-path workload does not establish costs for Suspense, Activity,
context projection, SSR/hydration, errors, portals, retained memory, or a real
application’s layout and paint. Those behaviors need their own correctness and
performance evidence.

In particular, [the pending-update contract](../../docs/react-compat.md) publishes
new parent props and context snapshots only on reveal. A browser probe confirmed
that changing an unresolved resource A to an already-resolved resource B leaves
the projected fallback visible until A settles, then publishes B. This is not an
immediate cancellation mechanism. Delete the boundary or change its **outer**
key when replacing a pending island. The timings above exercise neither that
waiting interval nor cancellation.

## Native SSR control

```sh
REACT_COMPAT_BASE=96c86fcd97f4fe8a158e360a6c6af6b4411ed32c \
BENCH_JSON=/tmp/octane-hosted-react-ssr.json \
  node benchmarks/octane-hosted-react/ssr-run.mjs
```

The separate Node runner bundles the public `octane/server` `renderToString`
and `octane/static` `prerender` exports against main commit
`96c86fcd97f4fe8a158e360a6c6af6b4411ed32c` and the candidate sources. This refresh
includes the base branch's SSR retry optimization in both lanes. It checks
identical 20-row static HTML and empty CSS
before timing and after every batch. This isolates native request setup and
teardown; it does not measure React SSR, Suspense, streaming, hydration, dynamic
component work, or retained memory. It uses 10,000 warmup calls per operation
and lane, followed by seven alternating rounds of 20,000 calls. Override these
with `REACT_COMPAT_SSR_WARMUP`, `REACT_COMPAT_SSR_ROUNDS`, and
`REACT_COMPAT_SSR_ITERATIONS`; `REACT_COMPAT_BASE` selects the baseline.

The final [ssr-results.json](./ssr-results.json) records all batch durations,
statistics, source and executable hashes, contributing modules, and the clean
merged worktree snapshot on the same shared Apple M5 Max machine. Both bundles
retain no React, React DOM, or React compatibility modules. The native SSR bundle grows
from 37,326 to 37,664 raw bytes and 13,256 to 13,368 gzip bytes: **338 raw / 112
gzip bytes** for request cleanup support. The earlier public-entry measurement
against `8741786` added 338 raw / 115 gzip bytes; this refresh isolates the
adapter against the updated SSR base. Both lanes use identical bundler options.

| Operation | Baseline mean, µs | Candidate mean, µs |
| --- | ---: | ---: |
| `renderToString` | 0.359 ± 5.8% | 0.370 ± 6.9% |
| `prerender` | 0.428 ± 3.7% | 0.441 ± 2.7% |

The percentages are 95% relative margins of error over all seven rounds; no
samples are dropped. These tiny timings on a noisy shared machine have
overlapping confidence intervals and establish neither a speedup nor a
regression. The bundle increase is deterministic for this fixture.
