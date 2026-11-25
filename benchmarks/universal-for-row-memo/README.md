# Universal `@for` row memo

This Node-only benchmark compiles one component through the public compiler
and renders it with the native object driver. The component holds a counter and
1,000 keyed `@for` rows. Each sample times 20 updates of one kind:

- `tick`: the counter changes and no row item changes;
- `toggle`: one row's item changes;
- `rotate`: the last row moves to the front, and every item is unchanged;
- `replace`: every row's item changes, so no row can keep its output.

The `pure` variant's rows render only from their item and the values they close
over. A production compile lets a surviving row whose inputs are unchanged keep
its committed output, as the DOM target's dependency-pure rows do. The `called`
variant formats each label through a module function, so its rows can never be
proven pure and always re-render. It is the same-run control.

Each row reads its label through a counting getter, so `row_renders` is the
exact number of row bodies that ran per update. Every run checks the final row
order, row props and counter value, and checks that unmount releases every host.

```bash
node benchmarks/universal-for-row-memo/run.mjs 7
node benchmarks/bench.mjs --quick --ratios universal-for-row-memo
```

To compare against another checkout, set `UNIVERSAL_BASE_ROOT` to its root. Its
compiler and runtime sources then run in the same process, sampled in
alternating AB/BA pairs, and the table adds the paired head/base ratio.
Dependencies always come from this checkout. Run with `node --jitless` to
measure an interpreter-only engine.

```bash
git worktree add --detach ../octane-main origin/main
UNIVERSAL_BASE_ROOT=../octane-main node benchmarks/universal-for-row-memo/run.mjs 15
```

Results describe the Node object driver, not native-device latency.
