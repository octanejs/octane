# Descriptor event parsing and delegation

This closes the `eventSlot` / `applyDeoptProp` allocation entry in #981. Repeated
known JSX event names reuse a parsed record from a lazy module Map. Descriptor
hosts allocate the singleton delegation array only when that native event phase
has not been registered. Native capture/bubble delivery and the latest handler
remain observable controls.

## Ownership and bounded cost

The cache accepts only names in the existing delegated event catalog: 90 base
names, each with a bubble and capture spelling, so at most 180 records survive
for the runtime module's lifetime. Records contain immutable name-derived
strings and a capture flag; they contain no element, handler, root, or props.
Their meaning cannot change with a render, so no render invalidation is needed.
Custom-element acceptance runs before cache lookup. Unknown native event names
and aliases absent from the catalog, such as `onAuditEvent` and `onDblClick`,
retain parsing and do not add cache entries.

The transferred cost is explicit: every accepted event name reaches an optional
Map probe, including uncached unknown native names. A miss performs a catalog
membership check. The first known miss allocates the Map, and ordinary native
events now initialize the existing catalog Set even when the application has no
custom elements. That first catalog use splits the name list once and inserts
180 names; the previous runtime first did this on custom-element classification
in this workload. Rejected custom events still perform their existing catalog
check and keep case-sensitive native listener handling. The no-event control
does not initialize either structure.

This is a source-work/allocation-site result. It does not establish browser
throughput, retained heap bytes, or whether a JavaScript engine materializes
every temporary string or array. The source also avoids lowercase and event-key
construction on a cache hit, but the counters below make no claim about their
allocation behavior.

## Workload and observation boundary

`events.mjs` bundles the selected actual runtime twice with production defines:
once clean and once with counters inserted in memory at TypeScript AST nodes.
It does not patch checked-in production files. It measures reached record
creation, name slicing, singleton delegation arrays, cache probes/inserts, and
catalog checks/split/insertion sites. A fresh happy-dom Window and runtime module
separate the clean and observed runs.

Each mode mounts 128 hosts and updates them eight times, creating fresh handler
closures in every render. Modes run in this deliberate order:

1. Ordinary attributes without events, before either lazy structure exists.
2. Plain `createElement` descriptors, six known event props: bubble/capture
   `Click`, `DoubleClick`, and `GotPointerCapture`.
3. Persistent `hostComponent` hosts with the same six known names, exercising
   the warmed cache and the already-guarded host delegation path.
4. Two unknown native names, retaining parsing while avoiding repeated
   delegation arrays. `dblclick` was already registered by mode 2.
5. Custom elements with known Click phases and unknown AuditEvent/DblClick,
   preserving the difference between native normalization and custom event case.

After the updates, native dispatch asserts capture before bubble and the latest
version/index for the first and last host. `onGotPointerCapture` must remain a
bubble handler while `onGotPointerCaptureCapture` is capture. Lowercase unknown
dispatch must not trigger the case-sensitive custom callbacks. All modes assert
survivor node identity, updated attributes, and an empty container after unmount.
Clean/observed DOM snapshots and baseline/candidate semantic hashes match.
Hydration, root-local events, diagnostics, rejected render rollback, listener
removal, and casing regressions are covered separately in
`packages/octane/tests/descriptor-event-slots.test.ts`.

## Before and after

Recorded using Node 24.20.0 on Darwin arm64 with the same entry, esbuild,
production settings, and dependency tree. Baseline is `3c1cc55d8` runtime SHA-256
`846eb67f2468ce0b2ccfb55353aec8a6528440e14688dc939857b93a5912c178`.
The combined candidate runtime SHA-256 is
`a1b14d8fd7fa2ad61f94f97928af612753efdf4325bbe3bd6493c9fa083036f9`.

Counts below are totals for 128 mounts or 1,024 host updates. Each cell is
baseline → candidate.

| Mode / phase | Parsed records | Name slices | Delegation arrays |
| --- | ---: | ---: | ---: |
| Descriptor known mount | 768 → 6 | 1,152 → 9 | 768 → 6 |
| Descriptor known updates | 6,144 → 0 | 9,216 → 0 | 6,144 → 0 |
| Persistent host known mount | 768 → 0 | 1,152 → 0 | 0 → 0 |
| Persistent host known updates | 6,144 → 0 | 9,216 → 0 | 0 → 0 |
| Unknown native mount | 256 → 256 | 256 → 256 | 256 → 1 |
| Unknown native updates | 2,048 → 2,048 | 2,048 → 2,048 | 2,048 → 0 |
| Custom mount | 256 → 0 | 384 → 0 | 256 → 0 |
| Custom updates | 2,048 → 0 | 3,072 → 0 | 2,048 → 0 |
| No events, either phase | 0 → 0 | 0 → 0 | 0 → 0 |

Transferred work in the candidate:

| Mode / phase | Cache probes | Cache insertions | Catalog checks | Catalog entries / splits |
| --- | ---: | ---: | ---: | ---: |
| Descriptor known mount | 768 | 6 | 6 | 180 / 1 |
| Descriptor known updates | 6,144 | 0 | 0 | 0 / 0 |
| Persistent host known mount | 768 | 0 | 0 | 0 / 0 |
| Persistent host known updates | 6,144 | 0 | 0 | 0 / 0 |
| Unknown native mount | 256 | 0 | 256 | 0 / 0 |
| Unknown native updates | 2,048 | 0 | 2,048 | 0 / 0 |
| Custom mount | 256 | 0 | 512 | 0 / 0 |
| Custom updates | 2,048 | 0 | 4,096 | 0 / 0 |
| No events, either phase | 0 | 0 | 0 | 0 / 0 |

The baseline has no cache operations and no ordinary-native catalog checks.
Its custom catalog checks are identical (512 mount / 4,096 updates), and its
180 catalog entries / one split occur at custom mount instead of known native
mount. A `cache_probes` count means the optional lookup expression was reached;
the very first probe short-circuits before a Map exists.

Clean bundle sizes for this entry:

| Runtime | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Baseline | 162,212 | 52,443 |
| Event changes only | 162,327 (+115) | 52,468 (+25) |
| Current runtime, including ownership and merged Provider fix #1080 | 164,017 (+1,805) | 53,069 (+626) |

The isolated runtime was built by replacing only `eventSlot` and
`applyDeoptProp` in the frozen baseline and adding the `ParsedEventSlot` and
`PARSED_EVENT_SLOTS` declarations. Its SHA-256 is
`6d11d83e4685c385842fb9dcb1cc83e6d0235713bf52e7e3d399b0e42bcc414b`.
Its operation counts and semantic hashes match the combined candidate. No
compiler output format changes are required.

## Reproduce and guard

```sh
git show 3c1cc55d8:packages/octane/src/runtime.ts > /tmp/descriptor-events-before.ts
BENCH_JSON=/tmp/descriptor-events-before.json node benchmarks/descriptor-renderer/events.mjs /tmp/descriptor-events-before.ts
BENCH_JSON=/tmp/descriptor-events-after.json node benchmarks/descriptor-renderer/events.mjs
```

Every target duplicates Node/platform, source/catalog/entry/runner hashes,
instrumentation sites, clean bundle sizes, and semantic-gate metadata so the
unified runner preserves them. Each `events-<mode>-<phase>` target has a
corresponding `-work` reference with 128 mount or 1,024 update host operations.
Guards use per-host ratios: six known probes; two unknown probes/checks/records
and slices; two custom probes and four classification checks; zero no-event
work. Warm known records/slices/arrays/inserts are zero. Cold known setup allows
six records/inserts/arrays, nine slices, 180 catalog entries, and one split over
the 128-host mount; the unknown mount allows one new delegation array. This
keeps cache startup and fallback work visible alongside the removed work.
