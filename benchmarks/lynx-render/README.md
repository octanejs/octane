# Lynx dual-thread render benchmark

This Node-only suite compares production-compiled Octane Lynx against the pinned
`@lynx-js/react@0.123.0` production Snapshot runtime on the same keyed-row app
and the exact same cheap fake Element PAPI. Octane exercises its background root,
async transport, main-thread receiver, and Element PAPI host driver. ReactLynx
uses its published JSX-to-Snapshot compiler, its exact internal Preact fork, an
empty main-thread bootstrap, and a background render through its real serialized
Snapshot patch and main-thread PAPI calls.

`build.mjs` compiles the fixture once per Lynx thread, as Rspeedy's two layers
do: `workload.ts` with the background renderer, and `main-workload.ts` with the
main-thread renderer, whose hooks are the one-shot first-screen runtime. Both
bundles load into one Node process with no shared modules. They are the baseline
that #1055's dedicated Lynx compiler backend is measured against
([plan](../../docs/lynx-compiler-backend-plan.md)).

```bash
node benchmarks/bench.mjs --quick lynx-render

# The fixture contract that PR CI runs: reentrant drain, program-run mount,
# main-thread first screen, and identity-preserving adoption.
node --test benchmarks/lynx-render/workload.test.mjs

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
  the final native host must expose the last queued value. The burst is encoded
  with the transport codec before the timer starts, as the background transport
  would send it, so the interval is the receiver's drain.

Octane-only page-load variants of `create_1k_rows_ms` / `create_10k_rows_ms`:

- `octane-lynx-cold` — the same background-only mount as `octane-lynx`, on a
  cold page. It is the reference for the two first-screen phases.
- `octane-lynx-first-screen` — the main thread's synchronous paint of the rows
  with its own specialization of the fixture, through the readiness release
  Rspeedy performs right after the main entry runs. The interval includes
  serializing the first-tree snapshot that the main thread's readiness reply
  carries to the background.
- `octane-lynx-adopt` — after an untimed first screen, the background's first
  render of the same rows through acknowledgement and adoption.

A Lynx page evaluates each thread's bundle once and creates one root, and the
first screen's adoption handshake is defined for that first root. These three
variants therefore import fresh module instances for every sample: they time a
cold page, including the first execution of every function they reach, and are
not comparable with the warm `octane-lynx` mounts. They run after every warm
sample, so their retained instances and large messages cannot put garbage
collection inside a warm ratio-guarded timing.

Each first-screen sample must paint the same visible tree as a background-only
mount, render the app once on the main thread and never on the background, and
receive nothing from the background. Each adoption sample must create no host,
keep every first-screen host object at its position, leave the visible tree
unchanged, render the app once on the background only, and then route a native
tap on the adopted tree to its background handler.

Deterministic counters, read once per Octane variant and scenario in an untimed
pass on a fresh page, cover the interval the timer would: wire frames and UTF-8
bytes in each direction (`*_frames`, `*_bytes_to_main`,
`*_bytes_to_background`), fixture component executions (`*_component_renders`),
and Element PAPI calls (`*_papi_calls`, with per-call meta). Counting wraps
every Element PAPI global, so it never shares a run with a timing sample. A
fresh page also keeps the counts independent of run order: a warm bundle's
listener identities, and so its wire bytes, grow with every root it creates.
`octane-lynx-bytes` reports the minified raw, gzip, and Brotli bytes of each
thread's fixture graph (`fixture-background.ts`, `fixture-main.ts`): the app and
its thread's runtime, without the harness.

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
guards; longer runs provide stronger performance evidence. Every run warms every
variant, alternates target order, and reports median and relative variation.
Pull requests that touch `packages/lynx`, `packages/rspeedy-plugin-octane`, the
universal runtime, the Lynx compiler files, or this harness run `--quick` on the
base and merge commits as a report-only section of the PR bench comment.
Both sides pay serialization: ReactLynx's actual Snapshot transport serializes
patches, and Octane's transport codec encodes every message to a JSON string
that the receiver decodes. Root/page creation,
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

## First-screen and adoption baseline

The page-load variants measure what #1055 sets out to remove. At 10,000 rows:

- The background-only mount sends 408,485 bytes to the main thread.
- The main thread's readiness reply carries the first-tree snapshot to the
  background: 14,835,865 bytes.
- The background's adopting commit is a per-host `create` batch, not the compact
  program run a fresh mount uses: 12,826,707 bytes to main. The acknowledgement
  then upserts a public handle for every host: 22,081,936 bytes back.

Adopting creates no host but makes 330,028 Element PAPI calls, against 250,026
for a fresh mount that creates all 90,008. Every adopted host is checked by
identity, parent, and equality, and receives attribute writes.

A 9-sample run on an Apple M5 Max (Node v24.18.0) measured, at 10,000 rows on
a cold page, a 611.8 ms first screen and a 937.0 ms adoption against an 89.1 ms
background-only mount: 6.87× and 10.52×. The committed ratio guards are
ceilings for this universal path. The compiled backend is expected to lower
them, together with the deterministic wire-byte and PAPI-call guards.

This compares the production Snapshot backend, not ReactLynx's experimental
Element Template backend. It measures first-screen adoption only in this
harness; it makes no native paint, layout, memory, or device claim. Those remain
the Android/iOS gates in the Lynx renderer plan.
