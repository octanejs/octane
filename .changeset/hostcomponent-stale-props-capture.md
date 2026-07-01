---
"octane": patch
---

Fix `hostComponent` (the primitive behind @octanejs/motion's `motion.<tag>`) leaving stale
props on its reused element and mis-handling capture-phase events:

- It now DIFFS against the previous render's props and removes any attribute, class, style,
  event handler, or ref that disappeared — instead of only ever applying the current props (so
  a prop present last render but absent now no longer lingers on the element).
- Events now go through `eventSlot` rather than a hand-rolled `on<Upper>` parse, so
  `onClickCapture` registers a real capture-phase listener (`$$capture:click` + a capture-phase
  delegated listener) instead of a dead `$$clickcapture` slot on a never-fired `clickcapture`
  event.
