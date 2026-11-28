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
node benchmarks/data-worker-validation/run.mjs --wire=json  # replies over the wire, JSON where exact
node benchmarks/data-worker-validation/run.mjs --wire=devalue
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
#3206 (`036063e75f`).

| Rows | Step | Lane | Node: tab busy (ms) | Node: wall (ms) | Chromium: tab busy (ms) | Chromium: wall (ms) |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 5,000 | reply | page | 2.28 | 4.55 | 1.97 | 3.90 |
| 5,000 | reply | worker | 0.91 | 4.31 | 0.76 | 3.62 |
| 5,000 | restore | page | 1.34 | 4.30 | 1.22 | 2.75 |
| 5,000 | restore | worker | 1.00 | 4.57 | 0.83 | 2.90 |
| 20,000 | reply | page | 9.40 | 19.16 | 8.56 | 16.80 |
| 20,000 | reply | worker | 3.59 | 17.19 | 2.93 | 14.60 |
| 20,000 | restore | page | 4.72 | 15.47 | 4.12 | 10.15 |
| 20,000 | restore | worker | 3.55 | 16.98 | 2.69 | 11.18 |

Tab schema calls are 1 for `page` and 0 for `worker` throughout.

- Validating in the worker saves the tab 60–66% of its busy time on a reply
  and 25–35% on a restore. Since #3204 the worker sends a value JSON keeps
  exactly as JSON text, which the tab parses, and since #3206 it checks a
  value it validated for that only once.
- What a 5,000-row reply costs, each part timed alone in Node:
  - in the worker: Zod's parse 0.18 ms, checking that JSON keeps the value
    0.61 ms, and writing its text 0.50 ms;
  - in the tab: parsing the text 0.69 ms.
  Together these are about half of the reply's wall time. The rest is the
  messages between the tab and the worker and the store's own work, which the
  bench does not split.
- A reply waits for no cache write. The worker saves a value once 50 ms pass
  without another change, so each lane wrote one value per round, after its
  burst of replies: 8 writes for 160 replies, in both runtimes.
- In the page lane the tab sends the worker the value it validated, for the
  worker to save. That is a structured clone, 0.92 ms to write and 1.46 ms to
  read at 5,000 rows, and most of the difference in tab busy time between the
  lanes. In the worker lane the tab says the value is unchanged and sends none.
- Zod builds its output lists holey, as `new Array(n)` does, and V8 copies a
  holey list item by item, with each index: slower to clone, and 7% more
  bytes, than the same rows from `JSON.parse`. Text does not have the problem,
  since `JSON.parse` in the tab builds its lists packed.
- Neither step includes network time, which in an app usually dwarfs both.

## Over the wire

With `--wire=json` or `--wire=devalue`, each reply goes through a
`createDataHandler`, encoded as text, and back through a client transport, all
inside the worker, as a reply from the app's server would be decoded there.
`json` uses `serverTransport`, which asks for JSON where it keeps the reply
exactly. `devalue` uses a client that does not ask, as one from before JSON
replies. The server validates with Zod alone (`servedRows`), so the schema-call
contract still counts only the client's validation. The report adds each
reply's length. Neither includes the network, or compression: compressed, the
JSON text of these rows is less than half the size of devalue's.

Apple M5 Max, Node 24.18 and Chromium 149, 8 rounds × 20 iterations, worker
lane (the worker validates):

| Rows | Runtime | Wire | Reply text (chars) | Tab busy (ms) | Wall (ms) |
| ---: | --- | --- | ---: | ---: | ---: |
| 5,000 | Node | devalue | 501,640 | 1.57 | 11.57 |
| 5,000 | Node | JSON | 589,843 | 1.63 | 7.93 |
| 20,000 | Node | devalue | 2,065,696 | 6.21 | 54.09 |
| 20,000 | Node | JSON | 2,385,955 | 6.18 | 32.58 |
| 5,000 | Chromium | devalue | 501,640 | 1.42 | 9.20 |
| 5,000 | Chromium | JSON | 589,843 | 1.49 | 6.30 |
| 20,000 | Chromium | devalue | 2,065,696 | 5.72 | 42.63 |
| 20,000 | Chromium | JSON | 2,385,955 | 5.63 | 26.40 |

- JSON replies reach the tab about 30–40% sooner: the server encodes and the
  worker decodes several times faster than devalue.
- The tab's busy time does not change, since the worker decodes the reply, and
  restores, which read the cache, are the same with either wire.

