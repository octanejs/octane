# Data worker validation

What validating server values in the data worker saves the tab, and what it
costs. Since #3147, #3149, #3165 and #3168, an owner given the build's
`contracts` validates each value before it reaches a tab of the same build,
and the tab takes it without running its own schema. This bench runs the same
read both ways:

- **`page`**: the owner has no contracts, so the tab validates, as before #3147.
- **`worker`**: the owner has the contracts, so it validates and the tab does not.

The bench runs in two runtimes, with the same owner (`owner.ts`) and steps
(`steps.ts`):

- **Node**: the owner runs in a worker thread (`worker.ts`), and the tab is the
  main thread (`bench.ts`).
- **Chromium**: the owner runs in a dedicated `Worker` (`browser-worker.ts`), and
  the tab is a page (`browser.ts`) that `chromium.ts` serves and drives in
  headless Chromium with Playwright.

In both, the tab connects with a `MessageChannel`, as a page does to its data
worker. The read returns `ROWS` rows (5,000 by default), and its output is a
Zod 4 array-of-objects schema, wrapped to count each validation in the thread
that runs it. The transport answers at once, so the times below hold no network
latency.

Each lane times two steps, 20 times per round:

- **reply**: `refresh()` an observed read until the tab shows the new value;
- **restore**: connect a new replica while the worker is offline, so the first
  value it shows comes from the worker's encrypted cache.

```bash
node benchmarks/data-worker-validation/run.mjs              # Node, 8 rounds × 20 iterations
node benchmarks/data-worker-validation/run.mjs --chromium   # headless Chromium
node benchmarks/data-worker-validation/run.mjs --quick      # 2 rounds × 5 iterations
ROWS=20000 node benchmarks/data-worker-validation/run.mjs 4
```

`run.mjs` bundles both runtimes' threads with esbuild, with `octane/data` from
source in production mode. Rounds alternate the lanes' order. The table reports the median
of the round medians:

- **Tab schema calls**: how many times the tab ran the schema in one step;
- **Tab busy**: the main thread's active time, which leaves out time spent
  waiting for the worker. In Node it is each sample's
  `performance.eventLoopUtilization()`. In Chromium it is the page's
  main-thread task time over the whole step (the DevTools protocol's
  `TaskDuration`) divided by its iterations, so it also spreads the step's
  first load across them;
- **Wall**: from the start of the step until the tab shows the value.

The schema calls are the bench's contract, and a run fails if they are wrong:
one per step in the tab for `page` and none for `worker`, and in the worker
none for `page` and one per value for `worker`. Every step also checks that the
tab shows all `ROWS` rows. `BENCH_JSON=<file>` writes the results as JSON.

## Results

Apple M5 Max, Node 24.18 and Chromium 149, 8 rounds × 20 iterations, at
#3183 (`fe1b69f860`).

| Rows | Step | Lane | Node: tab busy (ms) | Node: wall (ms) | Chromium: tab busy (ms) | Chromium: wall (ms) |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 5,000 | reply | page | 2.67 | 5.47 | 2.34 | 7.90 |
| 5,000 | reply | worker | 2.31 | 7.89 | 1.88 | 8.62 |
| 5,000 | restore | page | 2.01 | 5.43 | 1.83 | 4.05 |
| 5,000 | restore | worker | 1.61 | 5.95 | 1.52 | 4.75 |
| 20,000 | reply | page | 11.39 | 20.92 | 9.74 | 34.38 |
| 20,000 | reply | worker | 10.55 | 31.29 | 7.62 | 37.00 |
| 20,000 | restore | page | 7.66 | 21.15 | 6.43 | 16.20 |
| 20,000 | restore | worker | 6.22 | 23.64 | 5.15 | 18.12 |

Tab schema calls are 1 for `page` and 0 for `worker` throughout.

- Validating in the worker saves the tab 14–20% of its busy time in Node and
  17–22% in Chromium: in Chromium, about 0.5 ms per 5,000-row reply and 2.1 ms
  per 20,000-row reply. Most of the tab's time goes to receiving the value from
  the worker (structured-clone deserialization) and to the store's own work,
  and moving validation leaves both alone.
- Validation adds its own cost to each reply in the worker: Zod's parse, and
  `cloneable()`, the walk that checks the value survives the trip to a tab.
  In Node at 5,000 rows they take 0.35 ms and 0.8 ms; at 20,000, 1.7 ms and
  3.5 ms. In Chromium, a 20,000-row reply reaches the tab 2.6 ms later when
  the worker validates.
- Most of the rest of a reply's wall time is the cache. The worker saves each
  reply, and a refresh that arrives during a save waits for it. Both lanes ask
  for one save per reply. In Node, where base64 is slow, how many share a
  write depends on timing, so which lane's requests wait varies from run to
  run. In Chromium every reply was written on its own (168 of 168 in both
  lanes). The bench prints the writes but doesn't check them.
- Neither step includes network time, which in an app usually dwarfs both.
