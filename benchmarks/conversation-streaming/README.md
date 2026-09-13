# Conversation streaming

A production-built Octane application with a public SSR shell, native composer,
and independently hydrated conversation/history regions. Both private loaders
depend on the same request authorization. Uses real module-server calls,
implicit-owner `query$`, direct `value={draft$}`, and the normal application host.
There are no external accounts or services; authorization is a deterministic,
request-isolated fixture dependency, not proof of production authentication.

```sh
node benchmarks/bench.mjs --quick conversation-streaming
node benchmarks/conversation-streaming/build.mjs /absolute/new-output-directory
node benchmarks/conversation-streaming/run.mjs 30 --build-dir=/absolute/new-output-directory
# Optional real-browser run; use an explicitly approved installed browser.
node benchmarks/conversation-streaming/run-browser.mjs --build-dir=/absolute/new-output-directory
```

Builds copy this fixture into a fresh temporary directory, use workspace source
packages and the installed Vite toolchain, and retain emitted assets and hashes.
An existing build is never overwritten. `--build-dir` verifies the recorded
artifacts before reusing them. `BENCH_JSON` follows the root runner contract.
Browser execution is separate from the unified Node suite and requires an
installed Playwright driver/browser; `PLAYWRIGHT_MODULE` can identify that driver.

## Workloads and correctness

| Scenario | After shared 30 ms auth | Content |
| --- | --- | --- |
| `body-first` | Body at 8 ms; history at 25 ms | 20 turns, 10 history rows |
| `history-first` | History at 8 ms; body at 25 ms | 20 turns, 10 history rows |
| `large-waves` | Body at 8 ms; history at 25 ms; three later waves 8 ms apart | 200 turns, 60 history rows, cumulative yields |
| `large-waves-cpu` (Node) | Same asynchronous dependencies without timers | Same four-wave payload |
| `denied` | Auth fails | Public shell and local error arms; no private payload |

Untimed gates validate each displayed row and every streamed result value against
the fixture's pure data oracle. Trace checks prove one shared authorization,
no private loader before it, independent starts, and completed streams. Delayed
Node checks require shell publication before authorization and the faster region
before the slower region's first yield. Trace data is bounded and collected
outside timed consumption.

The first ready SSR snapshot is **not** the final live signal value. Later query
yields carry data, not replacement HTML on every yield. The browser checks the
initial snapshot while region code is held, then original-node adoption and the
complete live value after activation. This is distinct from explicitly fetched
SSR placement for conversation navigation or cached-to-fresh history, which this
initial-document suite does not claim to measure. The history buttons exercise
local selection, not route navigation.

Browser causal controls hold auth or the composer module only in **untimed**
flows. They prove visible placeholders, no private content before auth, native
early typing, focus/caret/selection preservation, and composer-only activation
without evaluating the parent or sibling modules. Timing flows use ordinary
scheduled auth and do not hold the composer; parent/sibling code remains held to
isolate independent activation. All controls fail on incomplete payloads,
unexpected refetches, resource errors, or hydration errors.

## Metrics and boundaries

- Node: first response chunk, shell chunk, first body/history HTML, complete
  response, process CPU, raw response bytes, chunks. This is Web Response
  consumption from the production handler, not HTTP TTFB or browser paint.
- Browser: navigation-to-shell/region DOM, composer focus-to-ready DOM, native
  input-to-derived DOM, and next-rAF observation. These are **not** paint, INP,
  or mobile-device measurements. Mutation-observer overhead is included.
- Delivery: raw, gzip level 9, and Brotli quality 11 bytes per emitted physical
  JS/CSS file, with first-requested and first-completed phases separately.
  Unique file totals are not actual transferred bytes and exclude headers,
  duplicate requests, cache effects, and streaming compression framing.

Report delayed latency alongside the no-delay CPU lane; do not attribute the
auth timer to renderer overhead. Process CPU also includes the same-process
consumer and fixture work. Run builds, other suites, and browser workloads
serially during timing. Raw samples and environment/source/asset provenance are
retained. Small smoke samples establish correctness, not precise tail latency.

Compare before/after **the same fixture, toolchain, and complete work**. An older
Octane revision lacking these APIs is not an equivalent baseline. No timing
ratio ceiling is guessed before a stable same-machine baseline exists. The
unified runner's local `--record`/`--compare` modes remain available; correctness
gates always apply. Server throughput, allocation rate, peak memory, real iOS,
IME, and BFCache need separate measurements.

The initial measured checkpoint and its limitations are recorded in
[Async Signals performance follow-up](../../docs/async-signals-performance.md).
