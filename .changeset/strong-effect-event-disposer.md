---
'octane': patch
---

Strong mode now follows a `useEffectEvent` callback that effect setup calls the
same way it follows a same-module helper. A disposer the callback returns counts
as the effect's cleanup once the effect returns it, so
`useLayoutEffect(() => start())` no longer reports
`OCTANE_STRONG_EFFECT_RESOURCE_LEAK` when `start` removes the listener it
added. The callback's parameters also name the call's arguments, so a target,
handler, or `AbortController` passed to it is matched against the cleanup. A
listener added to a target passed in without a release is now reported.
Handler, event type, target, and capture identity are still checked.
