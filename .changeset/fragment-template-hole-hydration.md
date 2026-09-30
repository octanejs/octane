---
'octane': patch
---

Recover when hydration finds different server content where a nested
multi-root (fragment) template component renders. A renderable `{expr}` hole
whose server value was text but whose client value is a fragment component,
rendered directly or returned from a plain component, crashed `hydrateRoot`
with `HierarchyRequestError: Node can't be inserted in a #text parent`. When the
server had rendered a different fragment component in that hole, hydration
kept the server's elements without reporting anything. The fragment now checks
its first root against the server node, reports the mismatch to
`onRecoverableError` once, logs the development hydration-mismatch warning,
discards the server content it would have adopted, and builds its markup on
the client. A matching server fragment is still adopted in place.
