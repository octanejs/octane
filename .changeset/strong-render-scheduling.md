---
'octane': patch
---

Strong mode now rejects scheduling work during render. Calling `setTimeout`,
`setInterval`, `queueMicrotask`, `requestAnimationFrame`, or
`requestIdleCallback` while rendering reports
`OCTANE_STRONG_RENDER_SIDE_EFFECT`. The check covers direct calls, `window` and
`globalThis` members, unreassigned aliases, synchronous helpers, eager effect
and event-handler factories, and lazy state initializers. Registering the
callback is the side effect: a component can render more or fewer times than it
commits. Schedule from an event handler, or from an effect that cancels the
work in cleanup. Deferred callback bodies, events, effects, and compatibility
mode are unchanged, and valid Strong modules compile to the same output.
