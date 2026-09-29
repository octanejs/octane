---
'octane': patch
---

Stop a universal renderer Suspense retry, including in Lynx, from livelocking
when it keeps suspending on a thenable that has already settled. Before, each
retry ran on that thenable's next microtask, so timers and native callbacks
never ran and the suspension could never end. This happened when a thenable's
owner publishes its `status` on a later task, or when a reverse-region DOM child
routed the same suspension back to its universal owner. A retry now waits one
task once the thenable's settlement has been seen, as React's Scheduler does. A
first settlement still retries right away.

Universal `use()` no longer rewrites a thenable `status` it did not set. Before,
it replaced a status React does not recognize, such as router-core's
`'resolved'`, with its own `'pending'`/`'fulfilled'` tracking. It now leaves the
status alone and treats the thenable as pending, matching React and the DOM
runtime.
