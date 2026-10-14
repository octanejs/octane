---
'octane': minor
---

A dormant `<Hydrate>` island whose captures or provided context values changed
before it activated now hydrates first, as React hydrates a dehydrated boundary
before the update that reached it, instead of rendering on the client. The
newer values then apply as an update in a render of their own. This changes
what an island observes when a parent update reaches it before activation:

- The island's first render runs with the captures and context values its
  server HTML was rendered with.
- Its effects mount with that first render's values, then update.
- A callback ref that the update replaces goes from the server node to `null`
  and back to the node.
- In development, server attributes that differ from the captures the island
  was claimed with now log the "won't be patched up" warning, as in any other
  hydration pass, and a structural difference from them is reported as a
  mismatch.
- The update patches the adopted server nodes, including any draft the user
  typed in them, instead of replacing them with client-rendered ones.

An update that reaches an island while its hydration attempt waits on data
still leaves the server HTML in place until the attempt retries, an intentional
difference from React that `docs/differences-from-react.md` records.
