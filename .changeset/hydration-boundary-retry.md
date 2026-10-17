---
'octane': patch
---

A Suspense or `@try` boundary whose hydration suspended now retries alone when
its wakeable settles: only the boundary renders again, over its server arm, with
the inputs and context it holds, and its parent component does not run again.
A retry inside a hidden `<Activity>` stays hidden. An error that a resumed
boundary's render throws, and that no boundary catches, now reaches the root's
`onUncaughtError` instead of `console.error`, and the root unmounts, as React's
does. A root reports that error alone, not the hydration failure it replaced.
