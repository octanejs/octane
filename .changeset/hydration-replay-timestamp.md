---
'octane': patch
---

Deferred hydration now replays captured interaction events with the original
event's `timeStamp`. Each replay used to be a newly constructed event stamped
with the replay time, so the time between a captured `pointerdown` and
`pointerup`, or how long an input had been held, collapsed to the hydration
delay. A boundary nested inside another boundary reset the clock a second time.
Replays from `<Hydrate>` boundaries, nested boundaries, and independent islands
now keep the captured value and remain untrusted (`isTrusted` is `false`).
