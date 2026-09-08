# ssr-workerd — streaming SSR inside real workerd (Cloudflare Workers runtime)

Runs the [streaming-ssr](../streaming-ssr/README.md) page inside **real
workerd** via miniflare — the deployment layer the Node suites
([ssr-http](../ssr-http/README.md), [tanstack-start](../tanstack-start/README.md))
cannot see. Workers cold start is isolate spin-up + parsing the **entire**
worker script (no `node_modules` — everything bundles in), and streaming runs
the web-streams path (`renderToReadableStream`) under workerd's scheduler.

Three targets:

| target        | what it is                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `octane-tsrx` | minimal ~12-line module Worker calling `renderToReadableStream` (`octane/server`)                                         |
| `react`       | the identical Worker calling `react-dom/server.edge` (Fizz edge)                                                          |
| `octane-app`  | the real deployment shape: `@octanejs/vite-plugin` + `@octanejs/adapter-cloudflare` `dist/server/worker.js` (octane-only) |

`octane-tsrx` vs `react` is the renderer comparison; `octane-app` vs
`octane-tsrx` isolates the metaframework layer's workerd overhead.

## Ops

| op                                                 | meaning                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `worker_script_bytes` / `worker_script_gzip_bytes` | deploy-relevant script size (deterministic)                                                                          |
| `cold_spawn_to_ready`                              | `new Miniflare()` → workerd ready (process + isolate + script parse)                                                 |
| `cold_ready_to_first_byte`                         | ready → first response body chunk (first-ever render)                                                                |
| `cold_spawn_to_first_byte`                         | spawn → first body byte — the headline cold number                                                                   |
| `workerd_shell_*` / `workerd_total_*`              | warm request: first body chunk / stream end per scenario; `workerd_total_allfast.opsPerSec` is the throughput number |

Cold ops are mean-scored (every sample is a fresh workerd process + isolate).
Requests are dispatched with `accept-encoding: identity` — workerd otherwise
gzip-buffers the stream and chunk timing would observe the compressor, not the
renderer. Miniflare cold start is a **local approximation** of Cloudflare's
(the platform pre-warms deployments and caches compiled scripts), so treat
absolute values as comparative, not production predictions.

The raw targets must pass the shared streamed-not-buffered gate
(`lib/stream-verify.mjs`). The app target wraps the render stream in the
`index.html` template (its first chunk is the head prefix) and its flush
behavior is itself a measured result, so it gets content-only checks.

## Parent-created promises: historical livelock, remaining duplicate work

The 50-pass livelock originally found by this suite was fixed on 2026-07-20;
it is **not the current behavior of this fixture**. The compiler now caches
eligible inline prop creations (`<List cards={makeCards()} />`) across SSR
replays. For opaque creations such as `const cards = makeCards()` in a parent
followed by `<List cards={cards} />`, a runtime recreation guard restores
progress. See the [landed design](../../docs/suspense-parallel-use-plan.md).

Progress is not the same as eliminating duplicate work. The opaque local
shape still recreates promises and can refetch on each parent invocation;
ordinary server `useMemo` does not make them stable across Suspense replays.
The [fetch-patterns investigation](fetch-patterns/README.md) measures this
with production-compiled components and actual workerd service-binding
fetches, including request caching, parallelism, and streaming controls.
The separate [runtime before/after result](fetch-patterns/CORE-RESULTS.md) keeps
the application unchanged: skipping abandoned replay waits reduced blocked-root
TTFB by 13.9% and per-card stream completion by 39.5% in local workerd. It does
not establish a 20% adapter or deployed-edge TTFB improvement.

`octane-app/src/StreamPage.tsrx` creates promises at compiler-cached `use()`
sites, with an individual boundary for each card so their loads can start
together. Merely moving fetches into children under one outer boundary can
introduce a discovery waterfall; the new investigation measures that too.

## Usage

Two additional, standalone [synthetic app workloads](app-workloads/README.md)
exercise a provider-heavy workspace bootstrap and a structured record/history
page with nested streaming boundaries. They use invented data, request-scoped
deduplication, and zero-delay/delayed/warm-data controls. Run them separately with
`node app-workloads/run.mjs`; they are not included in the unified suite below.

```bash
node run.mjs              # 10 cold iterations, builds first
node run.mjs 5 --no-build # reuse dist/ + octane-app/dist
TARGETS=octane node run.mjs 5 --no-build
```

Registered in the unified runner: `node benchmarks/bench.mjs --quick ssr-workerd`.

## Results (2026-07-20, Apple Silicon dev machine, miniflare/workerd, Node 24)

| op                         | octane-tsrx        | react (Fizz edge)  | octane-app         |
| -------------------------- | ------------------ | ------------------ | ------------------ |
| `worker_script_bytes`      | 111KB (31KB gz)    | 450KB (87KB gz)    | 200KB (55KB gz)    |
| `cold_spawn_to_first_byte` | 36.1ms             | 50.1ms             | 38.2ms             |
| `workerd_total_allfast`    | 2.15ms (465 req/s) | 2.13ms (470 req/s) | 2.24ms (446 req/s) |

Octane **wins the Workers deployment layer**: a fully-bundled Worker is 4x
smaller than react's (react-dom dominates a self-contained bundle — the
opposite of the Node picture, where react-dom stays external and pre-minified),
cold isolate→first-byte is ~0.72x, and warm throughput is at parity. The full
adapter deployment (`octane-app`) adds only ~2ms cold and ~5% warm over the
raw worker — and is still faster cold than raw React.

These historical numbers do not establish the cause of a particular app's
TTFB. Measure its data dependencies, cache state, promise stability, and
stream boundaries as well as its adapter overhead. A fast shell can hide
slow data completion; report both metrics rather than inferring one from
the other.
