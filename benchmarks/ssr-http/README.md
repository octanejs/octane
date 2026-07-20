# ssr-http — raw streaming API over real HTTP (cold + warm)

Measures Octane's `renderToPipeableStream` (`octane/server`) against React 19
Fizz (`react-dom/server`) through **real HTTP servers**, including **cold
start**: process spawn → TCP listen → first body byte. It reuses the
[streaming-ssr](../streaming-ssr/README.md) fixtures (identical page, identical
data schedules) behind one identical ~20-line `node:http` host per target
([server.mjs](server.mjs)), so any gap is the renderer's alone — no framework
router, no Nitro, no srvx.

Together with the [tanstack-start](../tanstack-start/README.md) suite this
forms the attribution chain for real-world TTFB:
**raw renderer (this suite) → +Start framework → +deployment host**.

## Ops

| op                          | meaning                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `import_renderer`           | fresh-process `import()` of the built server entry (module parse+eval) |
| `cold_spawn_to_listen`      | process spawn → TCP listen (node boot + module eval)                  |
| `cold_listen_to_first_byte` | TCP listen → first HTTP body byte (first-ever render)                 |
| `cold_spawn_to_first_byte`  | spawn → first body byte — the headline cold TTFB                      |
| `http_shell_*`              | warm request: first body byte (staggered / all-fast scenario)         |
| `http_total_*`              | warm request: stream end; `http_total_allfast.opsPerSec` is the sequential HTTP throughput number |

Cold ops are mean-scored (`scoreMode: 'mean'`): every sample is a genuine cold
start, so the steady-window default (which discards early samples as warmup)
would be wrong.

Methodology notes:

- Listen detection uses raw TCP connect probes (no HTTP), so the first HTTP
  request a cold server ever sees is the measured one.
- TTFB is the first response **body** chunk, not headers.
- Chunk counts/bytes are TCP-coalescing artifacts → reported under `meta`,
  never guarded.
- Fixture bundles are built exactly like streaming-ssr's (`minify: false`, per
  the fixtures' vite configs). Octane is bundled from TS source into the entry;
  react-dom stays external and loads its prebuilt minified production files —
  the same asymmetry real deployments have.

## Usage

```bash
node run.mjs              # 15 iterations, builds first
node run.mjs 30           # more iterations
node run.mjs 5 --no-build # reuse dist/
TARGETS=octane node run.mjs 5 --no-build
```

Registered in the unified runner: `node benchmarks/bench.mjs --quick ssr-http`.

## Results (2026-07-20, Apple Silicon dev machine, Node 24)

| op                         | octane-tsrx | react  | ratio     |
| -------------------------- | ----------- | ------ | --------- |
| `import_renderer`          | 1.4ms       | 9.6ms  | **0.14x** |
| `cold_spawn_to_first_byte` | 40.1ms      | 47.2ms | **0.85x** |
| `http_shell_staggered`     | ~0.5-0.7ms  | ~0.4-0.5ms | ~1.0-1.5x (sub-ms, noisy) |
| `http_total_allfast`       | 1.6ms (609 req/s) | 1.6ms (643 req/s) | ~1.05x |
| wire bytes (staggered)     | 22.8KB      | 11.8KB | **1.94x** |

At the raw-renderer layer octane **wins cold start outright** (its bundled
server runtime parses ~7x faster than react-dom/server) and holds warm parity
within noise. The two real renderer-side findings are the ~2x wire bytes
(block markers + JSON segment carriers + seed scripts + inline swap runtime)
and the shell write model (whole shell rendered before the first write), which
this small fixture cannot stress — see the tanstack-start README's
attribution table for where the app-layer gap actually appears.
