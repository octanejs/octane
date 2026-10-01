---
'octane': minor
---

Let `interaction({ events })` opt into `pointermove` and `pointercancel`, so a deferred boundary woken by a press can replay whether that press moved, was released, or was cancelled by the browser before hydration finished.

Both events only extend an interaction that another selected event already captured: they never start hydration or prefetch on their own, so selecting `pointermove` does not make a boundary hydrate on hover. Octane registers their document listeners only after a boundary that selects one captures intent, so pages that do not opt in never listen for pointer movement. The default `interaction()` events are unchanged.

Capture no longer cancels the native default of a captured `pointerup` or `pointermove`, matching how it already treats `pointerdown`.
