---
'octane': patch
---

Ship render rollback and suspension only with the entries that can drop a
render.

Every root render used to record an undo journal so the render could be rolled
back, and every bundle shipped suspension handling. Now `use`, `lazy`,
`Suspense`, `@try`, `Hydrate`, hydration, native signal reads, `ViewTransition`
and renderer regions install them as they load. An application that uses none
of them neither ships nor runs either: an uncaught error, an unmount or a
failed root replacement still tears its root down, and `ErrorBoundary` still
catches errors, all without a journal. The js-framework benchmark app shrinks
from 28.6 to 26.0 kB gzip, and chat-stream from 32.7 to 30.0 kB.

In such a bundle a thenable thrown during render, or rendered as a child, is an
ordinary render error, since nothing could hold the screen while it waits.
React suspends on it.
