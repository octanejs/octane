# Data bindings

Where an `octane/data` read spends its time when it renders, in production
builds of Octane and React run in Chromium. Each page mounts 5,000 rows, then
times four steps, each one synchronous `flushSync` (or `root.unmount()`):

- **mount** the rows;
- **rerender** them all, from a new parent prop;
- **write**: change one item's label through the store (or the bare store);
- **unmount** them.

The rows read in one of three ways (**scenarios**):

- `own`: each row reads its own item, `item({ id })`;
- `shared`: every row reads the one list, `items`, and shows its entry;
- `none`: rows read no data, which shows the cost a binding adds to components
  that don't use it.

And through one of these **lanes**:

| Lane | Octane | React | What it isolates |
| --- | --- | --- | --- |
| `hooks` | yes | yes | The documented `useRead(useDataStore().read(item, { id }))` |
| `handle` | yes | yes | `useRead(handle)` with every handle made once, outside render: `hooks ÷ handle` is what finding the handle costs per render |
| `signals` | yes | no | The store read reported as a native signal read, as #2410 shipped it and #2429 removed it (`signal-read.ts`) |
| `bare` | yes | yes | `useSyncExternalStore` over a trivial store holding the same values, the baseline |

The data store is seeded with every read and never loads during a timed step.
Every step checks the DOM (row count, and the written row's text) in the same
task, and every lane must render the same number of rows as the other lanes of
its renderer; a mismatch fails the run.

```bash
node benchmarks/data-bindings/run.mjs            # 8 rounds × 20 iterations
node benchmarks/data-bindings/run.mjs --quick    # 2 rounds × 5 iterations
node benchmarks/data-bindings/run.mjs 4 --no-build
```

Each round opens every case in a fresh page, in alternating order, and records
the median of its iterations. The table reports the median of the round medians,
each lane's ratio to `bare`, and the range of that ratio across rounds.
`BENCH_JSON=<file>` also writes the table as JSON.
