---
'octane': patch
---

A hydration attempt no longer changes the server's HTML while it renders.
What it would have changed waits for the commit of the attempt that completes:
the Text for an empty server text, a Suspense, `@try` or `ErrorBoundary`
boundary the client renders instead of the server's arm (one the server could
not finish, a streamed one whose content has not arrived, or one whose content
throws on the client), a `<Hydrate>` island or root that falls back, and the
client render that replaces them. A dropped attempt, such as one that
suspends, leaves the page exactly as the server sent it, with no mutation for
a `MutationObserver` to report, and its retry adopts the server DOM afresh.
