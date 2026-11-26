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

Apple M5 Max, Node 24.18, 8 rounds × 20 iterations.

| Rows | Step | Lane | Tab schema calls | Tab busy (ms) | Wall (ms) |
| ---: | --- | --- | ---: | ---: | ---: |
| 5,000 | reply | page | 1 | 2.54 | 4.33 |
| 5,000 | reply | worker | 0 | 2.37 | 10.56 |
| 5,000 | restore | page | 1 | 1.87 | 5.04 |
| 5,000 | restore | worker | 0 | 1.48 | 6.12 |
| 20,000 | reply | page | 1 | 10.59 | 17.99 |
| 20,000 | reply | worker | 0 | 9.48 | 43.76 |
| 20,000 | restore | page | 1 | 7.34 | 21.15 |
| 20,000 | restore | worker | 0 | 5.99 | 25.20 |

- The tab saves 7–20% of its busy time: about 0.2 ms per 5,000-row reply and
  1.1 ms per 20,000-row reply. Restores save a little more, 0.4 ms and 1.35 ms.
  Warm, Zod validates 5,000 of these rows in well under a millisecond. Most of
  the tab's time goes to receiving the value from the worker
  (structured-clone deserialization, about 1.1 ms for 5,000 rows) and to the
  store's own work, and moving validation leaves both alone.
- A reply takes longer to reach the tab: about 6 ms more at 5,000 rows and
  26 ms more at 20,000. In a CPU profile of the validating worker at 20,000
  rows, `cloneable()`, the walk that checks the validated value survives the
  trip to a tab, costs more than Zod's parse. The validating worker also saved
  to the cache about twice as often (78 saves against 37 at 5,000 rows), since
  its replies arrive further apart and fewer of them share a save. The bench
  prints those save counts, but they depend on timing, so it doesn't check them.
- Neither step includes network time, which in an app usually dwarfs both.
