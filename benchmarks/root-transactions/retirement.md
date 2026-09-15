# Deferred keyed deletion bookkeeping

## Contract and scope

An outgoing keyed row leaves the logical tree immediately, but its host nodes
remain connected until the root accepts the render. A later raw thenable or
Suspense hold must restore the exact nodes, state, native event handlers, and
uncontrolled browser state. Deletion layout cleanup observes connected DOM and
runs only after acceptance. Queued descendants of an outgoing row must not render;
undoing that removal must allow their queued edits again.

`retireRootBlock` is called for arbitrary keyed rows, component/branch replacements,
and deferred unmounts. Each distinct retired block in a live journal previously
allocated an undo closure that only deleted its membership from the transaction's
Set. A flat four-slot `JOURNAL_RETIRED` record carries the same Set and Block
references and replays the same deletion. Both root and nested transition rollback
interpreters recognize that record. The insertion, pending-state restoration,
journal order, Set lifetime, and deferred cleanup remain unchanged.

## Retained work

- Keep the retirement Set: the scheduler checks ancestor membership before
  draining queued descendants. Borrowed list markers also consult it to protect
  inert rows from an earlier clear.
- Keep eager node arrays for arbitrary parked ranges. A later nested rollback
  can detach an earlier parked row; reading its live range at final rollback
  cannot recover its original multi-node content.
- Keep connected teardown followed by removal of the exact captured nodes.
  User cleanup may change the DOM, and borrowed `@empty` markers can contain
  ranges belonging to earlier windows. A broad range removal is not equivalent.
- Keep the certified owned-list bulk-clear path's single batched undo closure.
  Replacing that one record with a record per row increases journal work.

## Measurement

Run the identical compiled fixture against a selected runtime source:

```sh
node benchmarks/root-transactions/retirement.mjs /path/to/baseline/runtime.ts
node benchmarks/root-transactions/retirement.mjs
```

The production fixture has 256 keyed rows, each with two host nodes and layout
cleanup. It compares unchanged membership, removing alternate rows, and full
deletion. Clean and observed bundles check visible order, survivor identity,
both host nodes, connected cleanup, and exactly-once teardown. The observed
runtime counts entry into the new-retirement branch; the script multiplies that
by the closure literals verified in `retireRootBlock`'s AST. These are source-work
counts, not a measurement of heap allocation or browser latency. The clean
bundle provides minified and gzip byte counts.

Node 24.20.0, baseline `ade5be862`, identical fixture and build settings:

| Operation | Retired blocks | Baseline closure sites reached | Candidate |
| --- | ---: | ---: | ---: |
| Unchanged membership | 0 | 0 | 0 |
| Remove alternate rows | 128 | 128 | 0 |
| Remove all rows | 256 | 256 | 0 |

The isolated retirement change moves the clean fixture bundle from 167,598 to
167,671 minified bytes (+73), and 54,459 to 54,497 gzip bytes (+38). The per-row
four-slot log size is unchanged. No wall-clock improvement is claimed.

## Interrupted transition environments

The new lifetime regression also found a pre-existing state-loss bug. A
transition can remove a row and suspend while an urgent edit for that row is
already queued. The transition restores its driving cells, but the boundary's
captured environment still contains the attempted list. Before the origin's
pending-cue render refreshes that environment, the queued descendant retries
the stale list, retires its own row again, and loses the row's state and nodes.

Changed environments now receive one four-slot property entry while a transition
attempt is active. The entry precedes the nested boundary's checkpoint: a local
boundary hold retains requested inputs for its retry, while a whole-origin
rollback restores the environment alongside its driving cells. Ordinary renders
create no entry. This is a correctness cost, not a claimed performance gain.

## Correctness

`keyed-removal-lifetime.test.ts` protects retained row state and both host nodes
while a transition removes that row and suspends, including a queued urgent edit
and a hold driven by multiple components. Existing
`parked-two-windows.test.ts` protects exact multi-node restoration across nested
windows and cleanup connectivity. Root suspension browser coverage additionally
checks focus, selection, native events, and SSR hydration adoption.

The transition, Suspense, two-window, fresh-scope hold, and hydration neighbors
pass 558 dev/prod executions across 44 files. All six lifetime executions also
pass after adding the multiple-origin control. Deliberately swapping the flat
record's Set and Block operands fails four rollback tests; omitting environment
restoration fails both urgent-row executions. Restoring each mutation returns
the corresponding tests to green.
