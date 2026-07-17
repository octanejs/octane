# Weather app benchmark

An app-shaped comparison of the same responsive weather UI in native Octane TSRX
and React. It is ported from Alicia Sykes's React weather app in
[`lissy93/framework-benchmarks`](https://github.com/lissy93/framework-benchmarks/tree/d3f0dcd07c9223c4847baddf9bfa49f060adf24a/apps/react).
The original UI, styles, deterministic mock data, service behavior, accessibility
contract, and test IDs are retained; the benchmark harness drives both ports through
the same observable browser interactions.

## Columns

| app | port | notes |
| --- | ---: | --- |
| `octane-tsrx` | 5292 | `.tsrx` components, keyed `@for`, `@if`, native events, Octane error boundary, and compiler-inferred dependencies for every effect/memo/callback hook |
| `react` | 5293 | React 19 reference with functional components, explicit hook dependency arrays, `memo`, and a class error boundary |

Both fixtures import the exact same weather service, utilities, styles, and mock JSON
from `shared/`. Live Open-Meteo calls remain available for manual use, but the harness
always uses local mock mode so network conditions cannot affect the result.

## Port adaptations

The following small fixes are applied equally to both versions:

- requests use `AbortController`, so a stale search cannot overwrite a newer city and
  unmounting cannot commit an abandoned response;
- the forecast scroll timeout is cleaned up when the active item changes;
- pressure falls back to the mock payload's `surface_pressure` field (the upstream
  component reads absent `pressure_msl` and renders `NaN hPa` in mock mode);
- the upstream 200 ms test-only headless delay is disabled by the harness's
  `benchmark=true` query;
- both documents include a shared description, favicon, and valid `robots.txt`,
  fixing the upstream fixture's incomplete Lighthouse metadata;
- the footer includes the attribution required when the live Open-Meteo API is used.

## Operations

Each independent sample starts in a fresh isolated browser context with an empty HTTP
cache and empty location storage. A throwaway context runs the whole scenario first to
warm the browser process and preview server without warming any sample context.

- `initial_ready` — the document navigation time origin until London weather is visibly
  committed after the mount effect and cold local mock fetch;
- `forecast_cycle` — 36 real click-driven updates across the seven keyed forecast rows,
  ending collapsed;
- `search_city` — submit Tokyo and wait for the loading-to-weather transition;
- `search_error` — submit an invalid city and wait for the visible error state;
- `search_recover` — submit Paris from the error state and wait for weather recovery.

Every timing stops before its correctness assertions. The runner verifies exact city and
weather output, persistence, single-expanded-row behavior, error/recovery visibility,
seven forecast rows, and finite pressure text. It also compares normalized observable
snapshots of the collapsed and expanded UIs, including visible text, state visibility,
weather values, forecast accessibility state, footer links, and a normalized element tree
that excludes framework bookkeeping comments. DOM censuses remain optimization
measurements beside these semantic controls.

## Lighthouse and shipped bytes

`weather-app-lighthouse` runs the production apps through Lighthouse's desktop Dense 4G
simulation with a fresh Chromium profile for every sample. It records performance,
accessibility, best-practices, and SEO scores together with first and largest contentful
paint, Speed Index, total blocking time, and cumulative layout shift. The upstream
80/90/80/90 category thresholds are retained in result metadata; the stable
accessibility, best-practices, and SEO thresholds are gates, while the noisier
performance threshold remains diagnostic. A browser preflight verifies visible London
weather, and every audit must load the local mock without making external requests.

The repository-wide `bundle-size` suite also builds both weather targets with the same
normalized production minifier used for its other app comparisons. Its `weather_*`
operations report raw, gzip, and Brotli bytes for the total JavaScript, authored app
chunk, and framework chunk.

## Run

```bash
node benchmarks/bench.mjs weather-app
node benchmarks/bench.mjs --quick weather-app weather-app-lighthouse bundle-size
```

## Attribution

The upstream application and copied assets are MIT licensed, copyright © 2025 Alicia
Sykes. See [`UPSTREAM_LICENSE`](./UPSTREAM_LICENSE). Live weather data is provided by
[Open-Meteo](https://open-meteo.com/) under its published terms; the benchmark itself
uses only the vendored synthetic mock payload.
