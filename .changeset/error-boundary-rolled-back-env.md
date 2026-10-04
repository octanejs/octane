---
'octane': patch
---

Build a JSX `<ErrorBoundary>` fallback from the committed render after a parent render rolls back.

When a parent re-rendered an `<ErrorBoundary>` with new props and a later sibling
then suspended the root, the root render rolled back and the screen kept the
committed props. The boundary still held the abandoned render's captured values, so
a descendant that threw afterwards got a fallback built from props that never
committed. It now gets the committed render's fallback, for an element or a
`(error, reset) => …` render prop, after an urgent update or a suspended
`startTransition`.
