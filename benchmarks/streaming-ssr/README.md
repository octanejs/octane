# streaming-ssr — out-of-order streaming SSR shoot-out

Node-only (no dev servers, no browser, no Playwright): the harness vite-builds
each target's production SSR bundle into this suite's `dist/`, then times the
built streaming render APIs directly:

| target        | API                                                        |
| ------------- | ---------------------------------------------------------- |
| `octane-tsrx` | `renderToPipeableStream` from `octane/server`               |
| `react`       | `renderToPipeableStream` from `react-dom/server` (Fizz)     |
| `solid`       | `renderToStream` from `@solidjs/web` (Solid 2.0)            |
| `ripple`      | `render(App, { stream })` + `create_ssr_stream()` (Ripple)  |

All four **do stream** (ripple 0.3.86 gained a stream-mode `render`; see the
caveat below). Chunks are collected via each API's natural destination — a
plain `{ write, end }` object (octane, solid), a minimal Node `Writable`
(React insists on one), or a web-stream reader loop (ripple) — timestamped
with `performance.now()` as they land in the harness callback.

## The workload

One product page, byte-identical in DOM shape across targets (only the
data-acquisition glue differs — `use()` / `use()` / `createMemo(promise)` /
`trackAsync`):

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
- **all-fast** — every card resolves at ~1ms. Data latency vanishes, so
  per-chunk engine overhead dominates; this is the throughput scenario
  (**renders/sec**, sequential, from mean `totalTime` — the ~1ms timer floor
  is included and identical for all targets).

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
  round model** (`runStream`): each round `settleSuspended`s **all** currently
  suspended thenables (`Promise.all`), then re-runs a **full page pass**. With
  10 independent boundaries that means the staggered schedule produces exactly
  **2 chunks** (shell, then one segment batch after the *slowest* promise) —
  octane does not flush card 0 at 5ms the way React/Solid/Ripple do. The
  metrics here can't see per-boundary latency directly, but `chunkCount` = 2
  is its fingerprint, and any regression that adds rounds (or passes per
  round) shows up in `total_staggered` tail and `total_allfast`.
- **octane all-fast `renders/sec`** — the cost of (passes × full-tree
  serialization): the all-fast render is shell pass + 1 settle + 1 full
  re-pass + segment flush. If N boundaries with distinct resolve ticks ever
  stop coalescing into one round, this crashes first. Don't tune the runtime
  from this suite alone — profile `runStream`'s re-pass loop.
- **react / solid / ripple** — reference engines measured on the same clock;
  their per-boundary flushing is the granularity octane's round model trades
  away.

## Fairness notes / genuine semantic differences

- Same DOM shape, same data schedule, promises created at render start for
  every target; the suspending read lives in a child component of the
  boundary in all four fixtures.
- **octane**: per-round full re-passes (documented divergence from React Fizz
  in `runtime.server.ts`) — batches all boundaries that resolve in the same
  round into one chunk, and re-renders the whole page each round.
- **React**: splits the shell across ~2KB view-buffer writes (`chunkCount`
  counts them); streams one segment + swap script per boundary.
- **Solid 2.0**: schedules its first flush ~1.5–2ms after render start; any
  boundary that resolves before that flush is **inlined into the shell**
  (no fallback). In all-fast this legitimately collapses the whole render to
  a single chunk — its `shellTTFB` then equals `totalTime`. `renderToStream`
  imports from `@solidjs/web` (the 2.0 package split).
- **Ripple**: streams per-block chunks with the right timing, but its
  streamed segments are raw block HTML **without client swap/seed wiring**
  (an upstream `TODO` in `ripple/src/runtime/internal/server/index.js`), so
  it ships fewer bytes and does less per-chunk work than the other three.
  Treat its numbers as a slightly-lighter-duty reference, not a strict
  apples-to-apples engine comparison.

The harness correctness gate asserts semantics only (shell exactly once, all
10 card payloads present, and — for staggered — the first chunk flushed before
the slowest data could resolve and the stream outlived the 50ms schedule).
Chunk framing is deliberately NOT gated; it's part of the result.

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
