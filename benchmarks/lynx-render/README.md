# Lynx dual-thread render benchmark

This Node-only suite compares production-compiled Octane Lynx against the pinned
`@lynx-js/react@0.123.0` production Snapshot runtime on the same keyed-row app
and the exact same cheap fake Element PAPI. Octane exercises its background root,
async transport, main-thread receiver, and Element PAPI host driver. ReactLynx
uses its published JSX-to-Snapshot compiler, its exact internal Preact fork, an
empty main-thread bootstrap, and a background render through its real serialized
Snapshot patch and main-thread PAPI calls.

```bash
node benchmarks/bench.mjs --quick lynx-render

# Multiple samples for a meaningful same-machine comparison:
node benchmarks/lynx-render/run.mjs 9
```

Targets:

- `empty_startup_ms` — one empty commit after each framework's root/page setup.
- `create_1k_rows_ms` / `create_10k_rows_ms` — one mount of a keyed row list
  shaped like the Vue-Lynx unified benchmark matrix: an id cell, a tappable
  label cell, and a tappable remove cell per row.
- `update_1k_rows_ms` / `update_10k_rows_ms` — the first real native tap after
  a fully settled mount, including the resulting state and visible-tree update.
  This prevents mount optimizations from merely deferring their work to the
  first user interaction.
- `drain_ms` on `octane-lynx-reentrant-{10k,20k}` — an Octane-only transport
  scaling pair that queues a synchronous commit burst from inside one Element
  PAPI update. Every version must be acknowledged and completed in order, and
  the final native host must expose the last queued value.

Each 1,000-row sample must create exactly 9,008 reachable host nodes and install
2,000 native event tokens; 10,000-row samples must create 90,008 nodes and
20,000 tokens. A depth-first visible-tree checksum verifies matching element
types, classes, ids, text, public attributes, native event names, and child
order while ignoring allocation order and Octane's renderer-private ref
selectors. Both targets must also deliver three real native taps through
`lynxCoreInject.tt.publishEvent`, exercising separate row handlers and state
updates, and produce matching visible trees after each interaction.
The reentrant transport pair is intentionally not compared with ReactLynx: it
exercises Octane's public wire protocol directly and guards 20,000 commits
against the same-run 10,000-commit baseline to catch superlinear queue drains.
After each timed Octane mount, the harness also verifies that every keyed row
used the same compiled nine-host program in one batched run, that host and
listener identities were derived from contiguous ranges, and that the entire
tree received one negotiated compact acknowledgement. Ref-free program
descendants must not receive eager renderer-private query selectors. Program
counts, wire-command totals, and private selectors are measured only after each
timed interval. A bounded-command gate also prevents the first native tap from
silently reinstalling every row's event handlers.

The `--quick` command records three samples to stabilize its same-run regression
guards; longer runs provide stronger performance evidence. Every run warms both
frameworks, alternates target order, and reports median and relative variation.
ReactLynx's actual Snapshot transport
serializes patches; the current Octane in-process ContextProxy transfers objects
by reference, so serialization is not charged to Octane. Root/page creation,
row-data generation, checksum validation, and teardown are outside both timers.

## Findings and path to ReactLynx parity

Both renderers materialize the same nine physical hosts per row. ReactLynx's
production compiler groups seven static hosts into one straight-line Snapshot
creator, adds two dynamic text hosts, and represents the result with roughly
three logical Snapshot owners and compact serialized patch opcodes. Previously,
Octane expanded every row into nine logical hosts, approximately 20 wire
commands, and nine acknowledged handle identities.

Octane now compiles eligible row trees into one immutable program containing
their static host structure, props, and native-event sites. Consecutive rows
share one batched mount command with contiguous host/listener identities and
flattened dynamic scalar values. Compiler-proven intrinsic loops can omit
redundant per-row owners, the universal renderer keeps descendants opaque during
normal updates, and the host executes the shared program directly.

A backwards-compatible capability handshake enables compact acknowledgements,
dense lazily materialized public handles, and deferred renderer-private query
selectors. Refs and public-instance callbacks request their own selector before
publication; native lists, worklets, portals, incompatible values, and
first-screen adoption retain the appropriate existing behavior.

The benchmark checks both mounting and the first actual native interaction so
an optimization cannot defer linear work to the next event. Focused behavior
tests cover late refs, native listeners, keyed updates, lifecycle callbacks,
recycling, malformed transport payloads, fallback, and transaction failures.

This compares the production Snapshot backend, not ReactLynx's experimental
Element Template backend. It makes no native paint, layout, adoption, memory,
or device claim; those remain the Android/iOS gates in the Lynx renderer plan.
