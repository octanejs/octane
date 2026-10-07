---
'octane': patch
---

Run `useDeferredValue`'s deferred render in a later task, so the browser can paint the urgent commit and handle input first.

The deferred render was queued on a microtask, which ran in the same microtask
checkpoint as the urgent commit that returned the previous value. The browser
could therefore neither paint the keystroke nor deliver the next one until the
slow deferred render had also finished, so `useDeferredValue` gave no
responsiveness benefit (#1864). The swap now runs in a host task posted after the
urgent commit, through `scheduler.postTask` where available, then
`MessageChannel`, then `setTimeout`. Urgent updates that arrive before that task
runs only change the value it renders, so a fast typist's skipped values are
never rendered deferred.

There is still no time-slicing: once the deferred render starts it runs to
completion, so a keystroke that arrives during it waits until it commits. Async
`act()` waits for a pending deferred render as it does for other scheduled work.
Code that expected the deferred value after awaiting only microtasks now needs
to await a task, or `act()`.
