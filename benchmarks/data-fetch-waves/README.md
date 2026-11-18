# Data fetch waves

How the way a screen asks for its data shapes its loading on a cold cache. One
project screen loads through `octane/data` in each of three ways, in a
production build served over HTTP, in Chromium. The suite counts the requests
the screen makes and how many sequential waves they take, and times when the
screen becomes useful and complete. It is the evidence for
[#3025](https://github.com/octanejs/octane/issues/3025).

```bash
node benchmarks/data-fetch-waves/run.mjs              # 15 iterations
node benchmarks/data-fetch-waves/run.mjs --quick      # 3 iterations
node benchmarks/data-fetch-waves/run.mjs 5 --no-build
```

`BENCH_JSON=<file>` also writes the table as JSON.

## The screen

```
main.screen
  @try  article.project      read project(id)         → h1.project-name
          @try  Owner        read user(project.ownerId)   (depends on project)
          @try  Members      read members(id)
          @try  Tasks        read tasks(id)
          @try  Activity     read activity(id)
```

The header is useful on its own; each section has its own pending state. The
handler ([`handler.ts`](handler.ts)) answers every query after a 10 ms database
round trip on the server's own network.

## Strategies

| strategy | how it reads | requests |
| --- | --- | --- |
| `component` | Each component reads its own data as it mounts. The sections mount inside the project's boundary, so they are discovered when the project arrives. | 5 |
| `prefetch` | The same components. The route ([`client.ts`](client.ts)) first calls `store.prefetch` for the four reads its URL determines. The owner still waits for the project's reply. | 5 |
| `aggregate` | Every component takes its part of one `dashboard` read, whose handler makes the dependent owner lookup in process. Its `entities` share the records with the other reads. | 1 |

Each also renders on the server (`ssr`), into a page that carries the store's
seed and hydrates.

## Conditions

Every case opens in a new browser context with the HTTP cache disabled, so
nothing is cached, not even the script. Responses are gzipped.

- `mobile`: Lighthouse's mobile preset through the DevTools protocol: 150 ms
  round trip, 1.6 Mbps down, 750 kbps up, 4× CPU slowdown.
- `desktop`: no throttling.

## Metrics

All times are from navigation start, the median of the iterations.

- `requests`: data requests the page made. Gated: exactly the strategy's count
  for a client render, and **zero** for a hydrated page.
- `waves`: requests per sequential wave. A request starts a new wave when it
  begins after the earliest response of the current one, as in
  [`router-data`](../router-data/). `1+4` is one request, then four.
- `script ms`: when the page's script began to run.
- `useful ms`: when the project header was shown. For `ssr`, first contentful
  paint.
- `complete ms`: when every section was shown and no fallback was. For `ssr`,
  first contentful paint, since the server sends the whole screen.
- `section fallbacks`: the most section fallbacks shown at once beside the
  header.
- `data ms`: from the first data request's start to the last one's end.

"Shown" means `checkVisibility()`: a boundary can hold resolved content hidden
behind its fallback.

Also gated on every iteration: every strategy renders the same text, and no
page error, console error or warning (including hydration mismatches).

## Results

Apple M-series laptop, Chromium (Playwright), 15 iterations, 2026-11-18. Every
case's wave shape was the same in every iteration.

| profile | render | strategy | requests | waves | script ms | useful ms | complete ms | section fallbacks | data ms |
| --- | --- | --- | --: | --- | --: | --: | --: | --: | --: |
| mobile | csr | component | 5 | 1+4 | 923 | 1116 | 1387 | 4 | 393 |
| mobile | csr | prefetch | 5 | 4+1 | 923 | 1114 | 1315 | 4 | 343 |
| mobile | csr | aggregate | 1 | 1 | 923 | 1116 | 1116 | 0 | 170 |
| mobile | ssr | component | 0 | 0 | 926 | 188 | 188 | 0 | 0 |
| mobile | ssr | prefetch | 0 | 0 | 926 | 188 | 188 | 0 | 0 |
| mobile | ssr | aggregate | 0 | 0 | 925 | 188 | 188 | 0 | 0 |
| desktop | csr | component | 5 | 1+4 | 14 | 119 | 119 | 0 | 28 |
| desktop | csr | prefetch | 5 | 4+1 | 15 | 119 | 119 | 0 | 26 |
| desktop | csr | aggregate | 1 | 1 | 14 | 118 | 118 | 0 | 23 |
| desktop | ssr | component | 0 | 0 | 38 | 40 | 40 | 0 | 0 |
| desktop | ssr | prefetch | 0 | 0 | 37 | 36 | 36 | 0 | 0 |
| desktop | ssr | aggregate | 0 | 0 | 37 | 36 | 36 | 0 | 0 |

What it shows:

- **Prefetching at the route moves the independent reads into the first
  wave** (`1+4` → `4+1`), but the screen still takes two round trips: the
  owner needs the project's `ownerId`. On mobile that saves 72 ms of 1387.
- **Only the aggregate removes the dependent round trip.** One request, one
  wave, and the whole screen shows with the header: 271 ms sooner than
  component reads on mobile. In exchange it shows nothing until every part is
  ready, and one failure fails every part.
- **Server rendering dominates both.** The hydrated page shows the complete
  screen at first paint, before its script has even loaded, and hydrates with
  no data request under every strategy. For `prefetch` that needs
  [#3028](https://github.com/octanejs/octane/pull/3028): before it, the
  route's prefetches reloaded all four seeded reads.
- **On a fast network the strategies tie.** Octane holds a Suspense reveal
  until 100 ms after the last fallback it committed (React holds 300 ms), so
  every data request finishes inside that window and the screen appears in
  one reveal at about 118 ms whichever way it fetched.
