---
'@octanejs/tanstack-router': patch
---

Keep a route match suspended until the state that holds it has ended, so the
route never renders before its loader data exists.

Two cases could lock up the page before this fix: a hydrated `ssr: false` route
whose client loader outlasted `pendingMinMs`, and a loader that redirected to a
route whose loader waits on a timer or the network. The route match
suspended on a different router promise in each state, but through `use()`,
which tracks promises by call position. Once the match changed state, a retry
got back the earlier, already settled promise. Router-core marks its settled
promises `status: 'resolved'`, which `use()` reads as still pending, so each
retry suspended again at once, on a microtask. Timers and network callbacks
never ran, so the loader could never finish.

The match now throws the relevant promise, like upstream, so no earlier promise
can be reused. A redirected match waits for its next store update instead of its
load promise, which router-core has already resolved by then.
