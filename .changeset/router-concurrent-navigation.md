---
'@octane-ts/router': patch
---

Navigation is now concurrent: the router drives its navigation state commits
through octane's `startTransition` (`Transitioner` sets
`router.startTransition = (fn) => startTransition(fn)`, replacing the previous
synchronous `(fn) => fn()`). When the next route suspends (a `useSuspenseQuery`,
loader, or `use(promise)`), octane keeps the currently-committed page on screen
until the new route's data resolves instead of immediately flashing the route's
pending fallback, so navigations no longer cause a skeleton flash.
