---
'octane': patch
---

Tear down removed collapsed template runs with one `destroy-run` command.

Clearing a 10,000-row keyed table shipped a 100,000-command teardown stream
(3.5 MB) from the background thread, acknowledged it with 70,000 per-host
tombstone deltas (2.9 MB), expanded every removed collapsed row into seven
logical records just to enumerate those commands, and left 70,000 generation
tombstones per clear cycle on both threads. All four costs were O(hosts) for an
operation whose input is O(runs).

The universal renderer now advertises a `teardownRuns` driver capability. When
the driver accepts it, a removed subtree that is still a collapsed program-run
instance with implicit contiguous ids skips expansion entirely and contributes
to one `destroy-run` command per contiguous range — the driver derives the
event unbinds, removals, and post-order destroys from the program it already
holds. Rows with refs, explicit ids, portals, or host callbacks keep the
explicit per-host path, as does any driver that does not advertise the
capability (the DOM boundary is unchanged).

The Lynx binding negotiates the capability end to end (a new teardown-run
readiness request base), expands the command against its dense record store to
re-enter the certified teardown fast path — falling back to an accepted-records
walk for reordered or explicit-path rows and to the general command loop for
partial ranges — and acknowledges a full-run teardown with a single
`remove-run` delta. Both threads then record one sorted retired-range tombstone
instead of 70,000 map entries, and the background client retires compact
metadata without materializing the handles it never observed.

On the shared 10,000-row table, the clear command stream drops from
3,514,556 B to ~370 B, the clear acknowledgement from 2,929,786 B to ~813 B,
and a create/clear/create cycle keeps the compact create acknowledgement from
the previous change. Reused id ranges keep bumping generations, partial-range
teardowns and rollbacks are pinned by new host-, client-, and emitter-side
regression tests, and the existing certified-teardown and remount suites run
unchanged.
