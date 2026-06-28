---
"octane": patch
---

Two delegated-event fixes:

- **No double dispatch across nested delegation targets.** A native event that reaches
  more than one delegation listener (a portal target nested inside a root, nested roots,
  or overlapping portal targets) is now walked once — the first listener does the full
  logical-tree walk and the rest no-op. Previously each nested target re-walked the
  shared part of the chain and fired its handlers multiple times.

- **`onXxxCapture` handlers now work.** Capture-phase handlers (`onClickCapture`,
  `onPointerDownCapture`, …) were compiled to a dead `$$clickcapture` slot plus a
  never-fired `clickcapture` delegated event. They now register a real capture-phase
  delegated listener and fire root→target (React's capture order) before bubble
  handlers. The real `gotpointercapture`/`lostpointercapture` events are handled
  correctly (not mistaken for capture-phase of `gotpointer`).
