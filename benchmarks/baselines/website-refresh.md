# Website benchmark refresh — 14 September 2026

The website imports 29 records from `local/`. This refresh measures the complete
framework matrix for each published suite with its normal sample count. The
home-page summary is recomputed with `createHomeSummary(FRAMEWORK_CARDS)`.

## Environment

- Source base: `7d4dc4f51fb1e97203fdcfe2a05d8b5a3e27ab6c`.
- Apple M5 Max, 18 CPU cores, arm64, macOS 26.6.2 (25G83).
- Node 24.18.0, pnpm 11.15.1, Playwright 1.61.1, Chromium 149.0.7827.55.
- Repository lockfile, with Ripple updated to 0.3.128 to match the already
  installed `@tsrx/ripple` 0.1.65 compiler's hydration helpers.

Suites ran sequentially, without concurrent test or build jobs. Framework
comparisons use measurements from the same suite invocation. Absolute timings
are specific to this environment; this refresh does not compare them with the
previous snapshot as evidence of an Octane speedup.

## Reproduction

Run from the repository root after installing the locked dependencies and the
Playwright browser:

```sh
node benchmarks/bench.mjs --record \
  js-framework js-framework-reorder js-framework-deopt todomvc \
  weather-app weather-app-lighthouse chat-stream svg-dashboard uibench \
  dbmon dbmon-deopt effectful-list memo-wall recursive-context spa-navigation \
  signal-favoring portal-swarm async-waterfall async-composition news \
  streaming-ssr ssr-throughput ssr-http tanstack-start bundle-size \
  three-renderer three-bundle-size lynx-table lynx-table-web
```

## Fixture and measurement corrections

- Plain TypeScript rows, TodoMVC, and chat fixtures expose the public
  `flushSync` adapter already supported by their harnesses. Scripted events now
  include their DOM commit within each timed interaction, following Octane's
  documented event scheduling contract.
- Signal and navigation work observers rebuild unminified diagnostic assets
  after timing. The SSR HTML observer likewise uses a separate unminified
  build and compares its complete response with the timed production bundle.
  Navigation also rejects missing `renderBlock` coverage. Normal timing and
  bundle-byte measurements retain production minification.
- Recursive-context work ceilings account for the three identity-aware Blocks
  introduced for direct Provider children by #1082: one under the root Provider
  and two under the local Provider. Exact visible-update and fallback gates
  remain enforced.
- Ripple 0.3.128 supplies the hydration helpers required by the current compiler;
  the news harness checks server-node retention and a working theme interaction.

The committed ratio guards in `ratios.json` are unchanged.

## Validation and historical guards

All 29 suite invocations exited successfully. The records contain 231 targets
(including diagnostics and budget controls) and 3,075 operations, with finite
scores and no failed harnesses.

Auditing the published records against the applicable committed ratio guards
checks 213 guards and finds 62 breaches:

| Suite | Breaches | Observation |
| --- | ---: | --- |
| Bundle size | 57 | All 57 also fail on the untouched source base. |
| Three bundle size | 2 | Both also fail on the untouched source base; the Octane byte counts are unchanged. |
| Rows reordering | 1 | `rotateb`: Octane/React 0.625 against a 0.6 ceiling. |
| Signal favoring | 1 | Paired shallow update: JSX/TSRX 7.931 against a 5.5 ceiling. |
| Three renderer | 1 | 1,000 frame subscribers: Octane/R3F 1.347 against a 1.0 ceiling. |

The byte comparison used a separate, untouched checkout of the source base
above, its frozen lockfile, and the normal `bundle-size` and `three-bundle-size`
suites. The flush adapters add 32 gzip bytes to the complete TodoMVC bundle and
12 gzip bytes to chat. Other Octane bundle measurements are unchanged. None of
the 59 byte breaches is newly introduced by this refresh.

The three timing breaches are retained as measured. This PR does not change
their timed fixture or runtime code; the signal observer rebuild happens after
all timing. They remain performance follow-ups, and this snapshot must not be
described as passing `--ratios`.
