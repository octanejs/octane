# streaming-ssr — out-of-order streaming SSR shoot-out

Node-only (no dev servers, no browser, no Playwright): the harness vite-builds
each target's production SSR bundle into this suite's `dist/`, then times the
built streaming render APIs directly:

| target        | API                                                        |
| ------------- | ---------------------------------------------------------- |
| `octane-tsrx` | `renderToPipeableStream` from `octane/server`               |
| `react`       | `renderToPipeableStream` from `react-dom/server` (Fizz)     |
| `preact`      | `renderToPipeableStream` from `preact-render-to-string`     |
| `solid`       | `renderToStream` from `@solidjs/web` (Solid 2.0)            |
| `ripple`      | `render(App, { stream })` + `create_ssr_stream()` (Ripple)  |
| `inferno`     | `streamQueueAsString` from `inferno-server`                 |

All six **do stream** (ripple 0.3.86 gained a stream-mode `render`; see the
caveat below). Chunks are collected via each API's natural destination — a
plain `{ write, end }` object (octane, solid), a minimal Node `Writable`
(React and Preact use one), or a web-stream reader loop (ripple) — timestamped
with `performance.now()` as they land in the harness callback.

Inferno's ordered queue stream flushes the synchronous prefix, then resumes
async class components through their native `getInitialProps()` lifecycle.

Svelte 5 is explicitly **N/A** here: its public server API returns buffered
`{ body, head }` output and exposes no component streaming renderer. Wrapping
that result in a custom stream would benchmark the wrapper rather than Svelte.

## The workload

One product page, byte-identical in DOM shape across targets. Only the
data-acquisition glue differs: Octane/React `use()`, a cached Preact resource
read, Solid `createMemo(promise)`, or Ripple `trackAsync`.

- a **synchronous shell** (~50 elements: masthead, 8-link nav, hero with
  stats, grid chrome, footer), plus
- **10 Suspense-boundary cards** (~22 elements each: title, subtitle, 5-row
  spec list, meta), each suspending on its own data promise.

Data promises are created **once per render, before the framework render
starts** (like backend requests fired when the HTTP request arrives), on a
deterministic `setTimeout` schedule:

- **staggered** — card *i* resolves at `(i+1)*5`ms (5, 10, …, 50ms). The
  streaming-shape scenario: every framework's `totalTime` is floored at ~50ms
  by the schedule itself, so the numbers that matter are `shellTTFB` and the
  chunk framing.
- **all-fast** — every card resolves at ~1ms. Data latency shrinks, so
  per-chunk engine overhead is more visible; this is the throughput scenario
  (**renders/sec**, sequential, from mean `totalTime` — the ~1ms timer floor
  is included and identical for all targets).

Three additional **Octane-only CPU controls** reuse the exact compiled page:
`cpu-10` and `cpu-100` release 10 or 100 cards immediately after the consumer
accepts the shell; `cpu-waves-50` releases 50 cards in reverse-discovery groups
of five, advancing the producer when each response chunk is accepted. No data
timers are added. The runtime's normal coalescing, full passes, serialization,
and consumer acceptance remain in the measurement. These cases isolate
per-component/per-boundary cost from a network or timer floor; they do not
represent application token-streaming latency or a cross-framework comparison.

## Metrics (medians over the iteration count, after 5 warmup renders)

- **shellTTFB** — first non-empty chunk. The user-visible "shell on the wire"
  latency.
- **totalTime** — the destination's `end()` (stream close). For staggered this
  is ≈ 50ms + engine tail; for all-fast it's nearly pure engine work.
- **chunkCount** — median number of non-empty chunks per render. This is a
  *shape* diagnostic, not a score: more chunks ⇒ finer-grained delivery.
- **bytesTotal** — total payload written (includes each framework's swap
  scripts / hydration wiring, so it differs legitimately).

## Reading the numbers — where a bad number points

- **octane `shellTTFB`** — the synchronous shell pass in
  `packages/octane/src/runtime.server.ts` (`runStream` first
  `runFullFramedPass` + shell flush). This should stay near the top: it's one
  sync pass with no scheduler.
- **octane `totalTime` / `chunkCount`** — the streaming engine's **pass-based
  wave model** (`runStream`): `settleFirstOfWave` waits for the first unresolved
  thenable, coalesces settlements from the same event-loop turn, then re-runs
  a **full page pass**. A staggered boundary can flush before a slower sibling;
  simultaneous settlements share a pass. Chunk counts describe the observed
  coalescing, not a fixed shell-plus-one-batch contract.
- **octane all-fast `renders/sec`** — the cost of (passes × full-tree
  serialization): the all-fast render normally coalesces into a shell pass
  plus one full re-pass and segment flush. Separately resolving boundaries
  legitimately require more waves. The controlled CPU cases make the cost of
  those waves and boundary-count scaling measurable without the 1ms data floor.
- **React / Preact / Solid / Ripple / Inferno** — reference engines measured on the same
  clock; their scheduling and flush policies can differ. Compare the output
  gates and observed chunk counts alongside timing.

## Fairness notes / genuine semantic differences

- Same DOM shape, same data schedule, promises created at render start for
  every target; the suspending read lives in a child component of the
  boundary in all six fixtures.
- **octane**: per-wave full re-passes (documented divergence from React Fizz
  in `runtime.server.ts`) — batches boundaries that resolve in the same
  event-loop wave into one chunk, and re-renders the whole page each wave. Resolved
  boundary markup travels in parser-safe JSON data scripts so trusted raw HTML
  cannot close a protocol carrier early; the correctness gate decodes those
  carriers before inspecting the semantic page shape.
- **React**: splits the shell across ~2KB view-buffer writes (`chunkCount`
  counts them); streams one segment + swap script per boundary.
- **Preact**: uses `preact-render-to-string/stream-node` with a real Node
  `Writable`; its cached resource read throws each card promise into a native
  compat Suspense boundary.
- **Solid 2.0**: schedules its first flush ~1.5–2ms after render start; any
  boundary that resolves before that flush is **inlined into the shell**
  (no fallback). In all-fast this legitimately collapses the whole render to
  a single chunk — its `shellTTFB` then equals `totalTime`. `renderToStream`
  imports from `@solidjs/web` (the 2.0 package split).
- **Ripple**: streams per-block chunks with the right timing, but its
  streamed segments are raw block HTML **without client swap/seed wiring**
  (an upstream `TODO` in `ripple/src/runtime/internal/server/index.js`), so
  it ships fewer bytes and does less per-chunk work than the other four.
  Treat its numbers as a slightly-lighter-duty reference, not a strict
  apples-to-apples engine comparison.

The harness correctness gate asserts the shell appears exactly once and all
requested card payloads are present (10 cards in the shared scenarios). For
staggered, the first chunk must flush before the slowest data could resolve and
the stream must outlive the 50ms schedule.
Protocol payload decoding is confined to this verification pass; measured
bytes, chunks, and timings always use the original wire output. The shared
timer-based scenarios do not fix chunk framing; it is part of the result. The
controlled CPU cases additionally require the same chunk count in every timed
sample, because consumer acceptance drives their producer schedule.

## Run

```bash
node benchmarks/bench.mjs --quick streaming-ssr   # via the unified runner
node benchmarks/streaming-ssr/run.mjs             # 30 renders/scenario
node benchmarks/streaming-ssr/run.mjs 5 --no-build  # fast re-run, reuse dist/
TARGETS=octane,react node benchmarks/streaming-ssr/run.mjs 10 --no-build
```

`BENCH_JSON` ops per target: `shell_staggered`, `total_staggered`,
`shell_allfast`, `total_allfast` (the latter carries `opsPerSec`); chunk
counts, bytes, skeleton counts and all-fast renders/sec land in `meta`.
Octane additionally reports `shell_cpu_10`, `total_cpu_10`, `shell_cpu_100`,
`total_cpu_100`, `shell_cpu_800`, `total_cpu_800`, `shell_cpu_waves_50`, and
`total_cpu_waves_50`, with the actual card/group sizes, chunks, and bytes in
`meta.controlledCpu`. The 800-card wave makes superlinear boundary bookkeeping
visible. Every CPU case passes the same complete-card-output gate and checks
that the shell precedes the controlled data. Increase the iteration count for
sub-millisecond cases; quick smoke runs establish correctness, not a performance
claim.
