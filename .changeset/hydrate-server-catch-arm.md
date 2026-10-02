---
'octane': patch
---

Adopt a server-rendered `@catch` arm (or JSX `ErrorBoundary` fallback) during hydration when the client's try body throws again, instead of reporting a hydration mismatch and rebuilding it. This covers a boundary that is a component's only output and a try body that renders a host element before it throws. The server now marks a caught arm, so the client replays the try body without claiming the catch arm's DOM. A body that renders or waits on the client replaces the server's catch arm without a mismatch report. The replay also reads the `use()` values of Suspense boundaries and `Hydrate` islands the server completed inside the abandoned try body, including streamed ones, so a body with a nested boundary adopts the catch arm immediately instead of waiting for client data.
