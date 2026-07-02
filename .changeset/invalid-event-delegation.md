---
"octane": patch
---

`onInvalid` now fires, on the control and its ancestors (React parity).

The native `invalid` event doesn't bubble, so octane's bubble-phase root delegation
never received it. It is now capture-delegated with the focus/blur ancestor walk —
matching React, where a form's `onInvalid` observes its controls' invalid events
(Radix Form relies on this to focus the first invalid control and suppress the
browser's validation bubbles).
