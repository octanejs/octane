---
'octane': patch
---

Prevent handlers from discarded suspended hydration attempts from receiving events during rendering. Custom-element listeners register when resumed hydration is accepted, which can change their order relative to third-party listeners registered while rendering.
