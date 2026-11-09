# Layout churn

Production Chromium renders 100 and 400 rows. Each row sizes a bar to the
measured width of its label, and every update changes every label. The variants
reach the same final geometry and differ only in when they read and write:

| Variant | Pattern | Reads and writes |
| --- | --- | --- |
| `effect-interleaved` | a layout effect per row reads the label, then writes the bar | interleaved |
| `snapshot-write` | a `useLayoutSnapshot` measurement per row that also writes the bar | interleaved |
| `effect-state` | a layout effect per row copies the width into state | batched, two renders |
| `snapshot` | a `useLayoutSnapshot` per row, with the bar width rendered from it | batched |
| `handler-interleaved` | one click handler loops over the rows, reading then writing | interleaved |
| `handler-batched` | one click handler reads every row, then writes every row | batched |

The fixture compiles without Strong mode, because Strong rejects `snapshot-write`
(`OCTANE_STRONG_LAYOUT_SNAPSHOT_WRITE`) and `effect-state`
(`OCTANE_STRONG_EFFECT_STATE_UPDATE`).

```sh
node benchmarks/bench.mjs layout-churn
node benchmarks/bench.mjs --quick layout-churn

# Measure another checkout's runtime with this checkout's fixture and compiler.
LAYOUT_CHURN_SOURCE=/path/to/base node benchmarks/layout-churn/run.mjs
```

Each update is one `flushSync` render, plus one click for the handler variants,
followed by a read that charges any pending layout to the update. The report
gives, per update:

- `layouts_<rows>` and `style_recalcs_<rows>`: Chromium's `LayoutCount` and
  `RecalcStyleCount` deltas. These are deterministic.
- `layout_ms_<rows>`: Chromium's `LayoutDuration` delta.
- `update_ms_<rows>`: wall time inside the page.

Every variant must render the same labels and bar widths. The batched variants
must also stay within three layout passes per update at both sizes. The
interleaved variants carry no bound: they record what the patterns cost today,
and a runtime that batches them should make their counts fall.

The interleaved variants lay out once per row, so their layout time grows
faster than the row count. On an Apple M5 Max they took
about 14 ms of layout per 400-row update, against about 1.5 ms batched.
