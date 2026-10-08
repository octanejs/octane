---
'octane': patch
---

Mount component trees faster by keeping rarely used per-component state out of every Block.

Every rendered component, list row and control-flow arm is backed by a Block. Fourteen of its fields served only a few features: Suspense, `@try` and `<Activity>` boundaries, `use()` thenables, fetch-tree warming, the loop guard for updates scheduled from effects, `useEffectEvent`, and `<ViewTransition>`. Those fields now live on a small record that a Block allocates the first time one of those features touches it. Ordinary Blocks drop from 79 fields to 66 and construct faster.

Paired cold first mounts before and after this change, in Chromium (40 fresh pages each):

- memo-wall (8,006 Blocks): about 4% faster.
- portal-swarm (1,205 Blocks): about 2% faster.
- recursive-context (4,102 Blocks): about 1.5–3% faster.

Behavior is unchanged.
