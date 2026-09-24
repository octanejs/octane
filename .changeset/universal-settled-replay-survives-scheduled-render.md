---
'octane': patch
---

Keep a live Suspense replay alive across an unrelated scheduled render so a
settled boundary still reveals its content.

A committed `@try`/`@pending` boundary wires its thrown thenables into a local
replay: on settle the root queues a microtask that re-renders with the pinned
memo cache. The next scheduled render unconditionally deactivated that replay
before preparing its own attempt. When the render only re-executed a scoped
owner, or retained the suspended subtree because its inputs looked unchanged,
nothing else ever re-attempted the region — the pending arm stayed on screen
after its promise had already resolved.

`prepare` now hands a live non-transition replay's memo cache to the fresh
attempt and disables retention for it, so the render itself re-attempts the
suspended regions. A settled boundary resolves inside that commit; one still
waiting on its thenables re-suspends and republishes a fresh replay.
Transition replays keep their existing supersede semantics.
