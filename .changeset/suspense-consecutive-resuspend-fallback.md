---
"octane": patch
---

A Suspense / `@try`/`@pending` boundary that re-suspends after resolving no
longer leaves the `@pending` fallback stuck alongside the resolved content.
When a boundary that was already showing its `@pending` fallback re-suspended on
a DIFFERENT thenable (e.g. two consecutive `useSuspenseQuery` calls on the same
route boundary), the runtime mounted a second fallback without tearing down the
first; once the second thenable resolved, the content mounted but a stale
fallback remained in the DOM next to it. The boundary now unmounts the prior
`@pending` body (removing its DOM exactly once) before mounting the new one, so a
re-suspend while pending REPLACES rather than STACKS the fallback, and the
fallback is gone once the content commits.
