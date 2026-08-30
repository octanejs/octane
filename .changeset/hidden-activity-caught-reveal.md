---
'octane': patch
---

Make hidden Activity caught-error publication scale linearly on reveal.

Activity now claims deferred reveal actions by their queue entry instead of
searching and compacting the remaining array for every action. A production
browser benchmark with 4,096 ordered `onCaughtError` reports dropped from 9.62 ms
to 2.92 ms while preserving hidden deferral, FIFO exactly-once publication,
cancellation, retry safety, output identity, and clean unmount.
