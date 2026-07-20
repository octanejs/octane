# tanstack-start — the same Start app on Octane and React

One application, built and served as **three targets**: `octane-nitro` runs the
repo's vendored `@tanstack/octane-start` (native `StreamOptions.injection`
stream path) as its nitro `.output` deployment server; `octane-minimal` is the
same octane app built **without** nitro (`octane/vite.config.minimal.ts`)
behind `octane/serve.mjs`; `react` runs `@tanstack/react-start` from npm,
**pinned to the same release family as the vendored packages** (react-start
1.168.28, react-router 1.170.18), behind `react/serve.mjs`. The two `serve.mjs`
hosts are line-for-line mirrors (node:http static fast-path + srvx
`toNodeHandler`), so `octane-minimal` vs `react` isolates the Octane
Start/renderer stack and `octane-nitro` vs `octane-minimal` isolates the
deployment host. A correctness gate proves all targets render and behave as
the same app; the perf suite then quantifies the differences.

## Provenance

Both apps derive from TanStack's own mirrored e2e pair at
TanStack/router@`753f919e` (MIT — see `LICENSE.upstream`):
`e2e/react-start/basic` (near-verbatim, trimmed) and `e2e/octane-start/basic`
(scaffolding), with the octane routes ported 1:1 from the react ones. Route
surface: `/`, `/posts`, `/posts/$postId`, a 404 post, and `/deferred`
(streamed deferred data). Both flavors read one deterministic fixture
(`shared/posts-data.mjs`) — no network, ever; latency knobs via
`BENCH_DATA_DELAY_MS` / `BENCH_DEFER_MS`. Tailwind was replaced by one inert
stylesheet on both sides (styling is not measured; upstream class names stay
in the markup and are compared).

## Running

```bash
pnpm --filter tanstack-start-bench build   # builds all three targets
pnpm --filter tanstack-start-bench compare # structural gate (must pass first)
pnpm --filter tanstack-start-bench test:e2e# behavioral gate, one spec × both
node run.mjs [iterations] [--no-build]     # perf harness (see below)
node ../bench.mjs --quick tanstack-start   # via the unified runner
```

- `compare.mjs` fetches every route from the production servers
  (octane-nitro, octane-minimal, react), strips each framework's dialect
  (hydration markers, framework scripts/attributes, head ordering, octane's
  `#__app` container), and requires the remaining element tree + text to match
  node for node. **Currently 10/10 route×flavor checks PASS.**
- `e2e/bench.spec.ts` runs identical journeys against both servers with a
  clean-console gate. **Currently 8/8 pass.**

Both correctness gates are fully green, including DOM-identity preservation
across client child navigation (verified by `remount-probe.mjs`; an earlier
octane full-tree remount on `/posts` → `/posts/3` was fixed on main by the
passthrough-hydration remount fix, #192).

## Perf harness (`run.mjs`)

Cold ops spawn a **fresh server process per sample** (ephemeral port, TCP
connect probes for listen detection so the first HTTP request stays cold,
group-kill + awaited exit between samples; methodology shared with the
[ssr-http](../ssr-http/README.md) suite via `benchmarks/lib/http-timing.mjs`):

| op                          | meaning                                              |
| --------------------------- | ---------------------------------------------------- |
| `cold_spawn_to_listen`      | process spawn → TCP listen (node boot + module eval) |
| `cold_listen_to_first_byte` | TCP listen → first HTTP body byte (first render)     |
| `cold_spawn_to_first_byte`  | spawn → first body byte — the headline cold TTFB     |
| `warm_ttfb_posts` / `warm_total_posts` | warmed `/posts` first-byte / end        |
| `warm_ttfb_deferred` / `warm_total_deferred` | warmed `/deferred` (BENCH_DEFER_MS=40) shell first-byte / stream end |
| `warm_stream_tail_deferred` | per-sample total − ttfb on `/deferred`: post-shell streaming cost above the 40ms defer floor |
| `warm_seq_request_home`     | warmed sequential ms/request on `/` (carries opsPerSec) |

Cold ops are mean-scored (every sample is a cold start); warm sample counts
scale independently of the cold-spawn knob because warm requests cost
milliseconds while cold spawns cost ~100ms. Sub-2ms warm ops still carry
~10-15% RME on a developer machine — treat small warm deltas as noise and
directions/multipliers ≥1.5x as signal.

## Results & attribution (2026-07-20, Apple Silicon dev machine, Node 24)

Read together with [ssr-http](../ssr-http/README.md) (the raw-renderer layer),
the measured attribution chain for "why is Octane's TTFB slower than React
in a real Start app" is:

| layer                                  | cold spawn→first-byte    | warm request TTFB          |
| -------------------------------------- | ------------------------ | -------------------------- |
| raw renderer (ssr-http)                | octane **0.85x** (faster: 40ms vs 47ms) | parity (sub-ms, noisy)     |
| + Start framework (octane-minimal vs react) | octane **0.66x** (faster: 55ms vs 84ms) | **octane ~2.3x slower** (`/posts` 1.7ms vs 0.7ms; stable across runs) |
| + nitro host (octane-nitro vs octane-minimal) | 1.1–1.2x (host tax)  | ~1.0–1.2x                  |

Headline findings:

1. **Cold-start TTFB is NOT octane's problem on this app** — octane is
   consistently faster to first byte from a cold process at both layers
   (`import_renderer`: octane's bundled server runtime parses ~7x faster than
   react-dom/server, 1.4ms vs 9.6ms). If cold TTFB looks worse in production,
   suspect the deployment host or bundle-size-sensitive environments
   (serverless): octane's Start server bundle is **~2.7x larger** (523KB vs
   194KB, `serverBundleBytes` meta), which cheap dev-machine cold starts
   under-penalize.
2. **The reproducible octane gap is warm per-request TTFB at the Start app
   layer** (~2.3x on `/posts`), and it is NOT present at the raw-renderer
   layer — the cost lives in the octane Start SSR path (router SSR +
   `renderToReadableStream` document mode + injection wiring), compounded by
   the renderer's render-the-whole-shell-before-first-write design
   (`runtime.server.ts` renderFullPass → single shell write), which scales
   with page size.
3. **Streaming works and beats the defer floor** on `/deferred`
   (`warm_ttfb_deferred` ≈ 2ms ≪ 40ms floor for every target);
   `warm_stream_tail_deferred` is at parity on this single-boundary page. The
   per-wave full-tree re-render cost needs many boundaries to show — that
   pressure lives in ssr-http's staggered scenario (10 boundaries).
4. **Octane ships ~2x the wire bytes** for the same streamed page at the raw
   layer (22.8KB vs 11.8KB — block markers, JSON segment carriers, seed
   scripts, inline swap runtime; `bytes_staggered` meta) and ~2.8x on
   `/deferred` (`deferredBytes`). Not a latency driver on loopback; real
   networks will notice.

Ranked follow-up work in `packages/octane/src/runtime.server.ts` (none of it
changed by this benchmark PR), each gated by an op above:

1. Per-request cost of the Start SSR path (gates: `warm_ttfb_posts`,
   `warm_seq_request_home`) — profile where the extra ~1ms/request goes:
   document-mode assembly, injection wiring, and the full-pass render model.
2. Incremental shell flushing instead of one synchronous full-shell string
   write (gates: `http_shell_staggered`, `warm_ttfb_posts`) — grows with page
   size; parity today on small pages.
3. Per-Suspense-wave full-tree re-render + per-wave bookkeeping (gates:
   `http_total_staggered`, `warm_stream_tail_deferred`) — needs
   many-boundary pages to surface.
4. Wire-format weight: markers, JSON carriers, seed scripts (gates:
   `bytes_staggered` / `deferredBytes` meta).
5. Server bundle size (~2.7x react's; gate: `serverBundleBytes` meta) —
   dominates serverless cold starts that this loopback bench can't see.

Ratio guards for the stable ops live in `benchmarks/baselines/ratios.json`
(the known-bad warm gaps get loose "only catch further regression" ceilings —
fixes should tighten them). Version skew note: the vendored octane chain rides
router-core 1.171.15 while the react flavor pins react-router 1.170.18 — same
release family, minor drift.
