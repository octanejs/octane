# Template call memoization

This Node/happy-dom suite compiles the same keyed-list fixtures in production
compatibility mode and Strong mode (`strong: true`, equivalent to a file's
`"use strong"` directive). It measures receiver-method invocations, not elapsed
time or heap allocation.

```bash
node benchmarks/bench.mjs --ratios template-call-memo
BENCH_JSON=/tmp/template-call-memo.json node benchmarks/template-call-memo/run.mjs
```

Each list starts with 16 immutable row snapshots whose `read(suffix)` method
returns a label. The parent updates an unrelated visible counter 32 times, then
appends a row, prepends a row, replaces one row snapshot, changes the real method
argument, and reverses the list. A second fixture includes a `console.log` in
the row body to check that production diagnostic logging does not prevent
Strong mode from reusing unchanged host rows.

A control list's remove handler captures the complete current rows array. After
appending a row, clicking the original row's remove button must keep the new
row. This is a deliberate invalidation workload: every survivor has a changed
event capture, even though its own row snapshot is unchanged.

The Strong-only purity-contract fixture covers the call shapes that syntax or a
React hook-name convention cannot prove: a hook-shaped ordinary method, a
component-local helper, a computed method, a call-produced callee, a
constructor, a tagged template, and a callback-bearing method. Strong mode
treats all seven as author-asserted pure projections and conditions their rows
only on the item and captured inputs. Compatibility mode continues to execute
them conservatively.

Every render checks all visible labels, ordering, and the identity of every
surviving keyed DOM node. Changed snapshots retain the same key and DOM node.
The remove handler runs through a native click; unmount must empty the root.
Both modes run with and without observation and must produce the same semantic
trace. The receiver methods and counters are supplied by the runner, outside
the component source analyzed by the compiler. Probes therefore cannot make an
otherwise eligible component appear impure. The logging observer also lives
outside the compiled source.

The `work-model` reference supplies fixed count ceilings. Positive references
allow exact zero guards for stable rows and reorders. Insertions and changed
snapshots should call only newly needed rows; changed real arguments and
captured event data must still update the correct output. The assumed-pure
fixture separately guards all seven shapes. Per-fixture counters remain in
result metadata. Minified compiler bytes and bundle gzip bytes expose code-size
cost separately; neither includes the runner or its counters.

`OCTANE_TEMPLATE_CALL_ROOT` can select a baseline checkout with its dependencies
installed, while `OCTANE_TEMPLATE_CALL_DEPS` can select the dependency tree used
by the bundler. Keep Node, dependencies, fixtures, and commands identical for a
before/after comparison. These counters make no browser latency claim and do
not measure SSR, hydration, or concurrent abort/replay.
