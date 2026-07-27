# list-clear

What a keyed list's **bulk clear** costs, split by the shape of its parent.

`batchClearItems` (packages/octane/src/runtime.ts) serves two shapes:

- **owns the parent** — the `@for` is the only content of its element, so the
  whole parent can be emptied in one call.
- **shares the parent** — interleaved JSX sits beside the list, so only the
  span between the block's own markers may be removed. There the runtime
  chooses between walking the span and a scoped `Range` by item count.

Every other suite's `@for` is the sole child of its parent, so this is the only
place the shared-parent path is measured at all.

## Ops

| op | parent shape | lists x items | what it pins |
| --- | --- | --- | --- |
| `clear_shared_small` | shared | 150 x 10 | the small-list clear strategy |
| `clear_shared_1000` | shared | 3 x 1000 | the large-list clear strategy |
| `clear_owned_1000` | owned | 3 x 1000 | control — same rows, untouched path |

The two shared sizes sit on opposite sides of the strategy boundary
(`RANGE_CLEAR_MIN_ITEMS`), so moving that boundary moves one of these numbers.

Each op clears a GROUP of independent lists in one commit. A single clear of a
single list is well under a millisecond, which is below the runner's
sub-millisecond regression floor (it requires an absolute excess over 0.1ms so
timer granularity cannot trip a false positive) — a real strategy change would
have been indistinguishable from noise. Clearing many lists per sample puts it
comfortably over 1ms while every individual clear stays the size being
measured.

`clear_shared_small` uses many short lists rather than a few long ones because
the rest of a clear commit — disposal, block bookkeeping, the state update —
scales with total items and dilutes the strategy difference, while the
difference scales with the number of clears. Forcing the runtime to always use
the Range moves this op by ~40%; with a few long lists the same change moved it
~14%, under the runner's 15% regression rule, so the guard would not have
fired.

## Correctness gate

A clear that removed the wrong span would report as a *faster* one, so each op
is applied once before timing and its DOM asserted: rows gone, and for the
shared list its `lead`/`tail` neighbours still present in order. A mismatch
fails the run.

## Running

```bash
pnpm --filter octane-tsrx-list-clear-bench preview   # :5298
node run.mjs [iter]
```

Or through the unified runner, which builds and boots the fixture itself:

```bash
node benchmarks/bench.mjs list-clear
```
