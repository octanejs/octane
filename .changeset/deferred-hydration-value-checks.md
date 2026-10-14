---
'octane': minor
---

Reduce the production code needed for hydration. The server and client keep consistent ranges for returned values and descriptor lists. Client-only descriptor hosts now let the host own its keyed rows without an extra list marker pair.

Compiled component returns reuse their caller's DOM boundary where safe. Hydratable roots and deferred islands now identify their own output version, including when no seeds are needed. Unversioned output still hydrates compatibly; an unknown version recovers only its owning root or island. Async retries retain their original version and user edits.

Server error boundaries now follow React's behavior. `@catch` and `ErrorBoundary` no longer execute during SSR. An error within `@pending` or Suspense reports to `onError`, sends the pending fallback marked for client rendering, and the client retries with its own data. Without an enclosing pending boundary, the server error reaches the shell. Successful `use()` results still hydrate from server data. Rejection details are no longer serialized into hydration seed scripts.

Production hydration still retains server attributes, class, style, and HTML. Deferred Hydrate islands compare stale values when activated and continue to preserve matching DOM.

Compiled native text and scalar attributes now prepare their next values per scope and write when their enclosing render commits. A later sibling which reads, throws, or suspends sees the previously committed DOM. Committed content remains interactive during async work, and intermediate render-phase replays do not publish these bindings.
