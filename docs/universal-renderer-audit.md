# Universal renderer audit — issue #981

Baseline: `1bc1926e809b6f1958dbc274dc68ad1334f68efc` (2026-09-14).

## Contract and scope

Accepted host batches alone publish topology, props, listeners, refs and owner
state. This work preserves prop evaluation order, keyed state and host identity,
duplicate-key diagnostics, suspended replay and aborted preparation. It reaches
manual and compiled universal components, local and transported roots, in
development and production. DOM hydration and SSR use separate implementations.

## Committed feature unions

A logical record lazily caches the feature union of its accepted subtree.
Repeated retention and scoped updates reuse that union. Accepted general writes
invalidate the record and cached ancestors; retained siblings keep their cache.
Binding-only writes, collapsed-template expansion and unmount invalidate their
changed records too. Aborted preparations publish no draft feature state.

Feature-free compact updates and compact-template updates preserve their fixed
feature sets. Collapsed templates include events on unexpanded descendants.
The cache adds one nullable numeric field per logical record, with no extra
retained collection. Cold scans enumerate own keys, preserving host prop
prototypes without invoking inherited proxy enumeration traps. A focused
regression reproduced that failure during final review before correcting the
scan. A cold scan remains linear. Checks for owner updates,
visibility, boundary episodes and component revisions remain live.

`benchmarks/universal-retention/run.mjs` compares clean and observed production
bundles. Across 64 state updates beside an unchanged child, committed-node visits
fall from 128 / 8,320 / 65,664 to zero for 0 / 128 / 1,024 hosts after warmup.
Changed-child controls still render fresh output and never enter this scan.
The cold traversal activates the observer; labels, host identity and unmount
cleanup must match in both bundles. These are work counts, not timing claims.

The new nested listener/ref regression passes in development and production.
Disabling cache invalidation causes stale ref cleanup in both modes, proving
that the test detects the cache's principal correctness risk. It also covers
aborted preparation followed by accepted child and parent updates.

A separate template-driver regression retains a child through parent updates,
then removes its descendant handler. Omitting collapsed descendant events from
the feature union makes the old public listener ID remain callable; the mutant
fails in development and production. Both container dispatch and direct public
listener dispatch are exercised before removal.

## Materialization and prop normalization

See [materialization evidence](../benchmarks/universal-materialization/README.md)
and [prop shape evidence](../benchmarks/universal-prop-shapes/README.md).

## Compact preparation

`RenderAttempt.hasCompactLists` starts false and becomes true when materialization
creates a compact leaf or template-list marker. Full and scoped preparation skip
compact expansion when no marker was produced. Full preparation also skips both
compact transaction trials. The marker belongs to the attempt, so nested roots
and later attempts cannot inherit it. A discarded render pass can leave it true;
that conservatively keeps a walk without changing the result.

The [preparation benchmark](../benchmarks/universal-preparation/README.md) counts
the optional walks in clean and observed production bundles. It includes compact
lists as a positive control and checks host output, identity, accepted versions,
and teardown. The behavioral regressions switch between compact and ordinary
children, abort a compact attempt, clear and refill, and schedule compact updates
from a child component. Required reconciliation and the stable-leaf comparison
remain: they decide which accepted hosts can be reused.

Across 64 updates, expansion visits fall from 64 / 8,256 / 65,600 to zero
for 0 / 128 / 1,024 ordinary hosts and from 128 / 16,512 / 131,200 to zero
for nested child owners. Compact positive controls retain 128 expansion visits
and 64 compact-leaf trial visits at every size. Disabling the compact marker
makes both the ordinary/compact transition and child-owned update regressions
fail in development and production because hosts are omitted.

## Public codec contexts

The codec context remains fresh for each encoding call. Its readonly `hostType`,
`name`, `value`, and container describe that call even when the codec saves the
context and inspects it after subsequent props, renders, or aborted attempts.
The existing per-root resource factory remains shared. The input value is the
caller's object; this does not promise a deep snapshot of that input. Successful
serializable results are separately cloned into the batch.

A regression saves contexts across two hosts, an aborted preparation, another
root, and a later accepted render, then checks the saved values and resource
handle root scopes. Replacing the context with one mutable per-root object makes
that test fail: earlier contexts incorrectly report the final prop's values.
This establishes why the proposed mutable-context reuse is rejected.

## Blueprint and command shapes

The discriminated command union remains the public driver and transport format.
Fields absent from an operation stay absent. Filling every operation with the
union's sixteen keys changes `Object.keys`, property presence, and structured
clone payloads even when values of the extra fields are `undefined` and JSON
omits them. Compact template programs and contiguous runs already avoid creating
many individual commands in capable renderers.

An untimed Node 24.20.0 / V8 13.6 diagnostic captured actual object-driver batches
and compared `node:v8.serialize` byte lengths with a sixteen-field equivalent:

| Operation | Current bytes | All fields present |
| --- | ---: | ---: |
| create | 57 | 173 |
| insert | 41 | 154 |
| update | 45 | 168 |
| remove | 32 | 154 |
| destroy | 24 | 155 |

These are V8 serializer sizes for the captured values, not estimates of every
transport's wire size. They demonstrate the cost that JSON-only measurements
would miss. A new tuple or fixed-slot command protocol would also require
explicit driver negotiation. No protocol change is justified by this audit.

Blueprints are internal, but adding every optional field to each instance also
adds storage to common hosts and ranges. A `%HaveSameMap` probe over 128 flat
hosts and 128 child owners, each updated fifty times, observed one host map and
one range map across the ordinary paths. Mixed feature paths still have distinct
shapes; the original whole-file literal count does not establish a megamorphic
steady state for each workload. This change keeps their sparse representation.
It claims neither that all blueprint shapes are unified nor that freezing public
commands is free. Removing command freezing would weaken batch immutability.

## Large transaction functions

The baseline production bundle on Node 24.20.0 reports 26,624 bytes of bytecode
for `createPreparedTransaction` and 10,655 for `materializeValue`. An uninstrumented
public-root workload with 128 child owners and 1,000 updates reaches
`TURBOFAN_JS` for both functions without forced optimization. Warmup includes
allocation-site and field-representation invalidations; the claim that these
functions can reach only Maglev does not reproduce on this source and engine.

The baseline preparation probe also narrows the three-prewalk claim. For fifty
updates of 128 flat hosts, compact-template trials visit zero nodes,
compact-leaf trials visit fifty total, and stable-leaf matching visits 6,400.
For 128 child owners below a shell, those counts are zero, fifty, and fifty.
Capability, feature, and first-shape checks already reject ineligible builders
early. The unconditional expansion walk was the redundant full traversal:
6,450 flat-node visits and 12,900 nested-node visits. The attempt marker removes
that work when compact lists are absent.

The general transaction still stages creates, updates, placements, events,
refs, ownership, and cleanup before acceptance. Its closures retain the state
needed by accepted, rejected, and aborted phases. Moving loops into top-level
helpers would not by itself remove that state or establish faster execution.
The orchestration remains together after the measured redundant traversal is
removed; no general transaction-throughput claim is made.

The bytecode and tier observations can be inspected on the same source with
`--print-bytecode --print-bytecode-filter=createPreparedTransaction` or
`--trace-opt --trace-deopt` while running the preparation benchmark. Use
`BENCH_SOURCE_REF` and `--measure` to select the frozen baseline. Tiering is
engine- and workload-dependent; the audit does not impose a V8 tier as a public
contract or correctness assertion.

## Disposition of the eight remaining Universal items

| Issue #981 item | Disposition |
| --- | --- |
| Component `key` deletion | Explicit keys are collected without adding a prop; keyed spreads snapshot getters in order and copy ordinary props without deleting. Key state and ordinary-prop behavior remain covered. |
| Host callback/metadata prop deletion | Copy ordinary props when the first consumed field appears, keeping host payloads fast while preserving classification, getter order, refs, and callback lifetimes. Plain props retain their direct path. |
| Identity paths and result arrays | Static hosts append to their caller's output; keyed scopes share structural/output paths. Persisted owner segment arrays, dynamic structural boundaries, and conditional/portal/Suspense result arrays remain for their identity and local-result contracts. No linked-path rewrite is claimed. |
| Serializable props and codec contexts | Earlier primitive `WeakSet` removal and shared resource factories remain. Fresh readonly contexts are retained and now explicitly documented and behaviorally tested. Mutable context reuse is rejected. |
| Duplicate-key validation | Unkeyed dynamic arrays avoid Sets, one-key arrays delay the Set, and single-child reconciliation avoids a redundant Set. Validation remains in production and downstream reconciliation because authored host props and static plans can introduce keys after dynamic-array validation. |
| Retained subtree scans | Cache accepted subtree feature unions, invalidate affected ancestors, and include collapsed descendant events. Cold scans and current owner/visibility checks remain. |
| Blueprint/HostCommand shape diversity | Preserve sparse internal blueprints and the existing public command protocol; ordinary measured paths already share a map, while all-field commands increase structured serialization and change property presence. No universal monomorphism claim is made. |
| Large functions and fast-builder prewalks | Skip optional compact trials/expansion using an attempt marker. Keep required matching and accepted/abort phase state; both large functions reach TurboFan on the audited workload, so a wholesale split has no demonstrated tier benefit. |
