---
'octane': patch
---

`optimistic$` replays a pending updater over each newer source value, as `useOptimistic` rebases its updates. A refetch, stream value or direct write to the source no longer hides behind a pending edit, and a rejected operation's edit no longer survives inside a later operation's value. A plain value passed to `set` still replaces the value below it.
