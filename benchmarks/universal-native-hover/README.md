# Native universal hover updates

This Node-only suite follows issue #1007's small native renderer workload:
20 rows, four component and `view` layers around each row, and 2,000 hover
events that select successive rows. It compiles JSX in production mode for the
public `octane/universal/native` renderer and uses the public object host driver.
An 80-row variant checks the cost of increasing the same component depth and
number of hosts fourfold.

The reporter's [Hermes reproduction](https://github.com/Josema/octane-and-solid-core-memory-reproduction)
uses hand-authored universal plans and an empty-dependency effect in each view.
Use that harness when investigating the issue's cumulative allocation, mounted
heap, and garbage collection; this compiled Node suite exercises a different
render path and has no view effects.

## Opt-in native host bindings

Updating a selection through `useState` in the root component still rerenders
that component and its descendants. For an external `{ get, subscribe }` source,
`universalHostBinding` connects its selected value directly to an ordinary host
property on a local direct universal root. One source notification can update
multiple bound hosts in one accepted driver batch. An aborted prepare leaves
the accepted source connected; accepting a replacement or unmounting releases
the previous subscriptions.

```ts
import {
  createObjectContainer,
  createObjectDriver,
  createUniversalRoot,
  defineUniversalComponent,
  flushUniversalSync,
  universalHostBinding,
  universalPlan,
  universalValue,
} from 'octane/universal/native';
import { createScope } from 'octane/signals';

const scope = createScope({ scopeKey: 'native-hover' });
const selected$ = scope.signal$('selected', 0);
const row = universalPlan('object', {
  kind: 'host', type: 'row', bindings: [['active', 0]],
});
const Rows = defineUniversalComponent('object', () =>
  [0, 1].map((id) =>
    universalValue(row, [universalHostBinding(selected$, (current) => current === id)], id),
  ),
);
const container = createObjectContainer();
const root = createUniversalRoot(container, createObjectDriver());
root.render(Rows, undefined);
flushUniversalSync(() => selected$.set(1));
console.log(container.children.map((child) => child.props.active)); // [false, true]
root.unmount();
scope.dispose();
```

This opt-in route currently requires a local direct driver and properties that
can be updated in place. Binding descriptors in a specialized compact
`universalFor` leaf plan are rejected; use ordinary host values when building
an ownerless list. The benchmark below exercises root `useState` and does not
measure this binding route. Measure cumulative allocation with the reporter's
Hermes harness before comparing the two approaches.

The committed [reporter patch](./reporter-host-binding.patch) changes only the
Octane side of the reporter's reproduction and adds a local build alias to its
runner. From this worktree, the following commands reproduce that comparison
with the reporter's bundled macOS Hermes binary. The package symlink supplies
metadata for the runner; esbuild uses the built local Octane files selected by
`OCTANE_NATIVE_DIST`.

```bash
OCTANE_ROOT="$(pwd)"
REPRO_DIR=/private/tmp/octane-1007-reporter
git clone https://github.com/Josema/octane-and-solid-core-memory-reproduction "$REPRO_DIR"
git -C "$REPRO_DIR" checkout c9fda17b6f50798475b358149875962707d1d7f9
patch -p1 -d "$REPRO_DIR" < "$OCTANE_ROOT/benchmarks/universal-native-hover/reporter-host-binding.patch"
(cd "$REPRO_DIR" && npm pkg delete dependencies.octane && npm install --no-save --package-lock=false)
ln -s "$OCTANE_ROOT/packages/octane" "$REPRO_DIR/node_modules/octane"
node packages/octane/scripts/build.mjs
OCTANE_NATIVE_DIST="$OCTANE_ROOT/packages/octane/dist/universal-native.js" \
  OCTANE_RAW_RESULTS=1 node "$REPRO_DIR/run.mjs"
```

On Hermes 1.0.0 (HBC 98, Hades), the patched 2,000-hover run allocated
11,564,392 bytes for Octane and 5,823,776 bytes for Solid 2.0.0-rc.6. Mounted
live JS after GC was about 0.94 MB versus 0.37 MB; both ended with an 8 MiB
heap capacity, and Octane collected 7 times versus Solid's 6. Both produced
101 hosts, 3,999 property changes, 2,000 events, 80 view effect creations and
cleanups, and zero hosts after unmount. The reporter's original root `useState`
implementation still reconstructs the whole hand-authored tree on each hover;
the opt-in binding keeps its App, Row, and View render counts at 1, 20, and 80.

## Compiled Node workload

Each sample keeps the tree mounted, dispatches 2,000 native host events, and
flushes the resulting state update. The harness verifies the original 101 or
401 host identities, four view layers per row, correct selected props, exactly
two changed row props on a separate event, and complete host teardown. It
clears the object driver's diagnostic `commits` history after every event;
otherwise that history retains every accepted host batch and can look like a
renderer memory leak. Mount, validation, and teardown are outside timed samples.

```bash
node benchmarks/universal-native-hover/run.mjs 7
node benchmarks/bench.mjs --quick --ratios universal-native-hover
```

To compare immutable production builds without rebuilding the current source,
copy the complete `packages/octane/dist` directory into a package root that
provides the same `package.json` imports, parser source, and `node_modules`,
then supply its path:

```bash
BENCH_OCTANE_DIST=/absolute/path/to/old-package/dist node benchmarks/universal-native-hover/run.mjs 7
```

For a local **cumulative allocation diagnostic**, write a V8 Inspector
sampling profile. The 2 KiB sampler includes objects collected by both minor
and major GC, so its sum estimates allocated bytes during the first warmed
20-row, 2,000-hover sample. It also prints the largest allocation stacks. A
profiled timing sample is distorted by instrumentation; compare normal runs
for latency, and use the same Node version, sampling options, and host for
allocation comparisons. The profile is local and may be large.

```bash
BENCH_ALLOCATION_JSON=/private/tmp/native-hover-allocation.json \
  node benchmarks/universal-native-hover/run.mjs 1
```

The ratio guard permits at most twice linear growth from 20 to 80 rows. This
checks scaling on the same machine and run; it cannot prove a reduction in
constant cost. The object driver's transactional simulation is part of the
measured public host path. Node/V8 sampling cannot reproduce Hermes's exact
garbage collector, allocation accounting, native GPU work, or event transport.
