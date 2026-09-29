---
'@octanejs/tanstack-query': patch
---

Keep a suspense query that follows `useSuspenseQueries()` suspended until its
data exists.

`useSuspenseQueries()` retained its suspense promise under a key built from the
queries that were still pending, so the key changed once the group settled. The
group then stopped reading its settled promise, and a following
`useSuspenseQuery()` or `useSuspenseQueries()` in the same component replayed
that promise instead of suspending on its own. It rendered with `data`
undefined, which usually threw into the error boundary, and the error stayed
after the query resolved. The group now keys its promise by every suspense
query it reads, as `useSuspenseQuery()` already keys by its query hash.
