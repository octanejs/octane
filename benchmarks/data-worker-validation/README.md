# Data worker validation

What validating server values in the data worker saves the tab, and what it
costs. Since #3147, #3149, #3165 and #3168, an owner given the build's
`contracts` validates each value before it reaches a tab of the same build,
and the tab takes it without running its own schema. This bench runs the same
read both ways:

- **`page`**: the owner has no contracts, so the tab validates, as before #3147.
- **`worker`**: the owner has the contracts, so it validates and the tab does not.

The owner runs in a Node worker thread (`worker.ts`), and the tab is the main
thread (`bench.ts`), connected by a `MessageChannel` as a page is to its data
worker. The read returns `ROWS` rows (5,000 by default), and its output is a
Zod 4 array-of-objects schema, wrapped to count each validation in the thread
that runs it. The transport answers at once, so the times below hold no network
latency.

Each lane times two steps, 20 times per round:

- **reply**: `refresh()` an observed read until the tab shows the new value;
- **restore**: connect a new replica while the worker is offline, so the first
  value it shows comes from the worker's encrypted cache.

```bash
node benchmarks/data-worker-validation/run.mjs            # 8 rounds × 20 iterations
node benchmarks/data-worker-validation/run.mjs --quick    # 2 rounds × 5 iterations
ROWS=20000 node benchmarks/data-worker-validation/run.mjs 4
```

`run.mjs` bundles both threads with esbuild, with `octane/data` from source in
production mode. Rounds alternate the lanes' order. The table reports the median
of the round medians:

- **Tab schema calls**: how many times the tab ran the schema in one step;
- **Tab busy**: the main thread's active time over the step, from
  `performance.eventLoopUtilization()`, which leaves out time spent waiting for
  the worker;
- **Wall**: from the start of the step until the tab shows the value.

The schema calls are the bench's contract, and a run fails if they are wrong:
one per step in the tab for `page` and none for `worker`, and in the worker
none for `page` and one per value for `worker`. Every step also checks that the
tab shows all `ROWS` rows. `BENCH_JSON=<file>` writes the results as JSON.

## Results

Apple M5 Max, Node 24.18, 8 rounds × 20 iterations, after `cloneable()` and
the cache's base64 were made faster.

| Rows | Step | Lane | Tab schema calls | Tab busy (ms) | Wall (ms) |
| ---: | --- | --- | ---: | ---: | ---: |
| 5,000 | reply | page | 1 | 2.74 | 5.78 |
| 5,000 | reply | worker | 0 | 2.41 | 8.83 |
| 5,000 | restore | page | 1 | 2.04 | 5.52 |
| 5,000 | restore | worker | 0 | 1.71 | 6.20 |
| 20,000 | reply | page | 1 | 12.32 | 20.04 |
| 20,000 | reply | worker | 0 | 10.20 | 33.02 |
| 20,000 | restore | page | 1 | 8.40 | 23.08 |
| 20,000 | restore | worker | 0 | 6.78 | 25.97 |

- The tab saves 12–20% of its busy time: about 0.3 ms per 5,000-row reply and
  2 ms per 20,000-row reply, and a little less per restore. Warm, Zod
  validates 5,000 of these rows in about 0.35 ms. Most of the tab's time goes
  to receiving the value from the worker (structured-clone deserialization,
  about 1.1 ms for 5,000 rows) and to the store's own work, and moving
  validation leaves both alone.
- Validation adds its own cost to each reply in the worker: Zod's parse, and
  `cloneable()`, the walk that checks the value survives the trip to a tab.
  At 5,000 rows they take 0.35 ms and 0.8 ms; at 20,000, 1.7 ms and 3.5 ms.
- Most of the rest of the gap in wall time is the cache. Each save of the
  20,000-row value (about 2 MB of text) holds the worker for tens of
  milliseconds, and a refresh that arrives meanwhile waits for it. Both lanes
  ask for one save per reply, but how many saves share one write depends on
  timing, so which lane's requests wait varies from run to run. The bench
  prints the writes but doesn't check them.
- Neither step includes network time, which in an app usually dwarfs both.
