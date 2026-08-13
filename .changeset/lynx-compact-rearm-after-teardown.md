---
'@octanejs/lynx': patch
---

Re-arm compact acknowledgements after a certified teardown retires a dense run.

A compact first mount publishes its hosts as implicit generation-one identities,
which is why octane's first table create acknowledges 70,000 hosts in a few
hundred bytes. But that mode could only ever engage once per root: the main
thread kept `implicitInitialGenerations` set forever, and the background client
refused any further compact acknowledgement while the retired segment's metadata
existed. Every create after a clear therefore fell back to publishing a full
per-host handle delta — on the shared 10,000-row table that is 17.4 MB of
`dispatchCoreContextOnBackground` traffic per create, ~600 ms of extra
main-thread wall, eagerly materialized background handle entries for all 70,000
hosts, and the background CPU growth measured in
`benchmarks/lynx-table/stages/results/bts-profile-10000.md`. The public
benchmark's warmed-page protocol (create/clear warmups, clear before every
sample) measures exactly this path, which is why octane's featured create cell
sat ~75% above its fresh-page cost.

Three coordinated changes restore the compact path for the steady state while
keeping every generation invariant explicit:

- A certified dense teardown now leaves the container on fully explicit
  bookkeeping: once every retired host has its tombstone and every surviving
  record's generation is stored, `implicitInitialGenerations` resets, so the
  next pure template run may negotiate an incremental compact acknowledgement
  again.
- Compact eligibility gains a fresh-id ratchet (`maxExplicitId`): a compact
  segment may only cover ids above every stored generation and every previously
  accepted segment. The universal allocator issues ids monotonically, so real
  mounts always qualify, while any id reuse — including a remount over a retired
  range — keeps taking the explicit path and keeps bumping generations.
- The background client tracks how many compact host codes remain live and drops
  the segment metadata when the last one retires (restoring it if that
  acknowledgement rolls back), so a later compact acknowledgement no longer
  fails the fresh-container guard.

On the shared table app, the create-after-clear acknowledgement drops from
17,330,831 B to 719 B with identical rendered output; handle identity, stale
generation rejection, and remount generation bumps are pinned by new host- and
client-side regression tests.
