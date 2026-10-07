---
'octane': patch
---

Activate independent `<Hydrate>` islands that become ready together one per task.

Each island activation hydrates its widget in one synchronous block. Islands that
became ready together activated back to back in one microtask checkpoint, so the
browser could not deliver input or paint until every one of them had finished.
This happened with repeated instances of one widget, which share a module, with
islands released by one stylesheet `load` or `IntersectionObserver` callback, and
with a back/forward-cache restore, which resumes every unfinished island at once.

Now the first island to become ready in a task still activates at once, and each
one after it activates in a later task of its own, from `scheduler.postTask`,
`MessageChannel`, or `setTimeout`. An island holding captured interactions takes
the next turn ahead of the others. An island waiting for its turn keeps capturing
input for its replay, and pausing or disposing it still cancels the activation.
Custom hosts that call `registerIndependentHydrationIsland` get the same pacing.
