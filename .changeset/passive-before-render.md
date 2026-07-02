---
"octane": patch
---

Pending passive effects now flush before the next render pass begins (React parity).

React flushes pending `useEffect` work at the start of any new render
(`flushPassiveEffects`-at-render-start), so a commit's passive effects are
guaranteed to observe the world **before** a follow-up render mutates it. Octane
deferred all passives to post-paint unconditionally, so when a layout effect
scheduled a follow-up render (a Presence-style reveal: commit #1 flips `open`,
a layout effect flips local state, commit #2 mounts the revealed children), both
commits' passive effects merged into one post-paint drain and ran child-first —
letting a freshly-mounted child's effect observe an event announcing its own
mount. Real-world symptom: Radix Tooltip self-closed immediately on open (its
content's `TOOLTIP_OPEN` document listener heard the open dispatch from its own
root).

Both the async scheduler and `flushSync`'s layout-cascade convergence loop now
drain pending passive effects before starting a render wave, matching React's
observable ordering: an earlier commit's passive dispatch fires while later-
commit children do not exist yet.
