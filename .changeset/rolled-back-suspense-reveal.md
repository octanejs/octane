---
'octane': patch
---

Keep a Suspense boundary pending, and on its committed inputs, when the root
render that revealed it is rolled back.

A parent update can reveal a pending boundary and then roll back because a later
sibling suspends the root. The rollback restored the fallback on screen, but the
boundary still recorded its primary as visible, so `@pending` stayed up for good
and no later update revealed it. The boundary's record now rolls back with the
render, so the next commit, or its own data resolving, reveals it as before.

Rollback also restores the boundary's inputs. Previously, a boundary that
retried after the rollback rendered the abandoned props: for example its own
promise settled, a child suspended or threw, or a JSX `<Suspense>` or
`<ErrorBoundary>` rebuilt its children, fallback or catch arm. It now renders
the props of the committed screen.
