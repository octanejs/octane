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
  In Node at 5,000 rows they took 0.35 ms and 0.8 ms; at 20,000, 1.7 ms and
  3.5 ms. In Chromium, a 20,000-row reply reached the tab 2.6 ms later when
  the worker validated. Since then, the walk records the objects it has seen
  only for a value deep or large enough to need it, which cut its share at
  5,000 rows to about 0.33 ms (a CPU profile of the worker).
- Zod builds its output lists holey, as `new Array(n)` does, and V8 copies a
  holey list item by item, with each index. So a value the worker validated is
  slower to post and to receive than the same rows decoded from JSON or the
  cache: at 5,000 rows, 1.11 ms against 0.79 ms to serialize, 1.52 ms against
  1.18 ms to deserialize, and 7% more bytes. That is why a restore costs the
  tab as much in the worker lane as in the page lane, where the tab runs Zod
  itself. Copying the lists into packed ones in the worker costs what it saves
  there.
- Most of the rest of a reply's wall time is the cache. The worker saves each
  reply, and a refresh that arrives during a save waits for it. Both lanes ask
  for one save per reply. In Node, where base64 is slow, how many share a
  write depends on timing, so which lane's requests wait varies from run to
  run. In Chromium every reply was written on its own (168 of 168 in both
  lanes). The bench prints the writes but doesn't check them.
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

