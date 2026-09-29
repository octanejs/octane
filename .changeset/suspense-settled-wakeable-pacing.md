---
'octane': patch
---

Stop a Suspense retry from livelocking the page when it keeps suspending on a
promise that has already settled. This happens when a resource reader throws a
resolved promise before its own state catches up, or when `use()` reads a
thenable whose `status` React does not recognize, such as `'resolved'`. Each
retry used to run on that promise's next microtask, so timers and network
callbacks never ran and the suspension could never end. A retry now waits one
task once the promise's settlement has been seen, as React's Scheduler does. A
promise's first settlement still retries right away.
