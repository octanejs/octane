---
'octane': minor
---

Reduce the production code needed for hydration. The server and client keep consistent ranges for returned values and descriptor lists. Client-only descriptor hosts now let the host own its keyed rows without an extra list marker pair.

Server error boundaries now follow React's behavior. `@catch` and `ErrorBoundary` no longer execute during SSR. An error within `@pending` or Suspense reports to `onError`, sends the pending fallback marked for client rendering, and the client retries with its own data. Without an enclosing pending boundary, the server error reaches the shell. Successful `use()` results still hydrate from server data. Rejection details are no longer serialized into hydration seed scripts.

Production hydration still retains server attributes, class, style, and HTML. Deferred Hydrate islands compare stale values when activated and continue to preserve matching DOM.
