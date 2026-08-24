---
'octane': patch
---

Retain and retry client roots that suspend without a Suspense boundary. Keep
initial roots empty and preserve committed UI, state, refs, and layout/passive
effects during suspended updates, including structural replacements and portals.
Retry the latest inputs, cancel abandoned work after supersession or unmount,
and report actual resource rejections through normal error handling.

Retain server DOM while initial hydration is suspended, adopting the existing
nodes, attaching refs, and running layout/passive effects only when hydration can
commit.

Keep effect-thrown thenables on the error path and tear down roots on unhandled
effect errors.
