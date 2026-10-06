---
'octane': patch
---

Fall back when hydration reaches a `@try` or `ErrorBoundary` that the server
did not render at that position.

Before, a boundary with no server range built fresh markers. When its try body
threw, the catch arm rendered beside the server nodes that stood there, so both
were visible and nothing was reported. Now the missing range is a mismatch, as
it is for an `@if` or `@switch` branch: the nearest Suspense boundary, `@try`
boundary, `<Hydrate>` island, or the root renders on the client, as in React 19.
