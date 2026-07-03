---
"octane": patch
---

Perf: a `startTransition` swap at a dynamic `<Comp/>` (`componentSlot`) or an
`@if`/`@switch`/JSX-ternary branch (`renderBranchSlot`) now renders the incoming
subtree ONCE instead of twice. Both sites previously rendered the new subtree
off-screen, discarded it, then rendered it AGAIN in place — a full double render
of every body, hook, and DOM node. They now COMMIT the off-screen work-in-progress
the way value-hole `childSlot` already did (adopting and renaming the WIP marker
pair in place, splicing its captured effects/refs/store-syncs into the live
queues), halving the swap render work (incoming body executions: 3→2 per swap,
matching the `childSlot` baseline). Suspend/error hold semantics, effect ordering,
and final DOM are unchanged; single-root `<Comp/>` return slots keep the legacy
path.
