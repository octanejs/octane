# tauri-shell

Octane, React, and Inferno **inside a real Tauri window**, not in a headless browser.

## Why this is not just another browser suite

A Tauri app does not run on the engine the other benchmark suites measure. On
macOS it runs on WKWebView/JavaScriptCore, on Linux on WebKitGTK, and only on
Windows on the Chromium/WebView2 that Playwright drives. A framework's ranking
on V8 does not transfer to JSC: ahead-of-time compiled output and a runtime
virtual DOM lean on different parts of a JIT. The desktop cold start (process
spawn, webview init, custom-protocol asset load) has no browser equivalent at
all.

It also cannot be driven from outside. `tauri-driver` supports Linux and Windows
only, because WKWebView exposes no WebDriver. So each target measures itself
inside the window and reports through an IPC command; `run.mjs` only spawns
processes and aggregates.

## Ops

| op | what it measures |
| --- | --- |
| `boot_ms` | navigation start to the first presented frame: module parse, execute, and first mount |
| `stream_async_ms` | 4000 events pushed from Rust into a 200-row capped log tail, each framework batching as it sees fit |
| `stream_sync_ms` | the same 4000 events with one `flushSync` commit each, so the cost is per rendered frame |
| `create_ms` | commit 10,000 keyed rows |
| `update_ms` | commit a change to every tenth of those rows |
| `swap_ms` | commit a swap of two rows at opposite ends |
| `clear_ms` | commit the removal of all 10,000 |
| `js bytes` | shipped client JavaScript, raw and gzip |

The four row ops are flushed synchronously, so they time the commit rather than
how soon a frame happened to land. Their input arrays are built by shared code
**outside** the measured region: that work is byte-identical between targets, so
including it would add the same constant to both columns and blunt the ratio.
Layout is forced right after each measurement for the same reason: both targets
produce identical DOM, so charging layout to the framework column would bury the
difference, but leaving it unforced would let it drift into the next op.

## Reading the results

**`stream_async_ms` is a semantics measurement, not a throughput one.** Read it only
next to the reported commit count. React auto-batches updates arriving from a
Tauri event callback and collapses all 4000 into a **single** commit, so it
finishes sooner by never rendering an intermediate line: a log tail on React
looks frozen and then jumps to its final state. `stream_sync_ms` is the
comparable number, because there all targets commit 4000 times. Octane reads
almost the same on both, since it already commits per event either way.

Any op whose median lands at or below 2ms is printed as `~Nx (clock floor)`.
WebKit quantizes `performance.now()` to 1ms, so a ratio built on a 1ms
denominator carries roughly ±50% error. The direction is real; the digits are
not.

`boot_ms` currently gets 5 samples per target, one per launch, against the
variance of a whole process start. Treat it as indicative, and raise
`BENCH_REPS` before quoting it.

## Fairness

- The Rust host is the same source for all targets, rebuilt once per target.
  `generate_context!` **embeds** `frontendDist` into the executable, so swapping
  the directory after a build measures whichever frontend was compiled in; the
  `result.target` assertion in `run.mjs` exists because that failure is
  otherwise invisible. Only the host crate recompiles, never its dependencies.
- All targets talk to Tauri through raw `@tauri-apps/api`, **not** through
  `@octanejs/tauri`. The binding is a ref write plus a teardown guard; putting it
  on one side only would fold its cost into the framework column.
- React runs without `StrictMode`. Its double-invoke is a development aid and
  Octane has no equivalent, so enabling it would compare different amounts of
  work.
- All targets build with the same normalized Vite settings (`esnext`, terser, 2 passes,
  toplevel mangling).
- Row labels are derived from the index, never randomized: a benchmark that
  cannot be re-run to the same numbers cannot catch a regression.
- Every repetition is a fresh process, so `boot_ms` is a real cold start. The
  first launch per target is a discarded warmup, because it pays for OS caches
  that later runs reuse.
- The window runs `incognito`, so WKWebView keeps no URL cache between
  processes. Without it a later target can boot the previous target's cached
  `index.html` and reports under the wrong name; `run.mjs` asserts the reported
  target to keep that from ever passing silently.

## Running it

```bash
node benchmarks/tauri-shell/run.mjs      # 1 warmup + 5 measured runs per target
BENCH_REPS=11 node benchmarks/tauri-shell/run.mjs
```

Needs a Rust toolchain. A window opens for each run and closes when its target
reports; leave the machine alone while it runs, because an occluded WKWebView
throttles timers and paints.

Results print as a table and land in `results.json` (gitignored).
