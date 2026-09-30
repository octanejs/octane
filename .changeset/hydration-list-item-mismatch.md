---
'octane': patch
---

Discard and report server list content that the client's items cannot adopt
during hydration. Several list shapes previously kept stale server content on
screen, or rebuilt it without reporting to `onRecoverableError`:

- A renderable hole whose client value is an empty list (`[]`) kept whatever
  the server rendered there visible. Hydration now discards it and reports the
  mismatch once.
- A list item whose server content cannot be that item now discards the rest
  of the list's server content, builds the client items, and reports once. This
  covers a bare server element where the client item needs a range of its own
  (the stale element stayed visible) and a bare element of another tag (it was
  swapped silently).
- A list or `@for` with more client items than server items builds the extra
  items and now reports once, with one development warning in place of one per
  item.
- A renderable list with fewer client items than server items now discards the
  extra server items and reports them, as `@for` already did.

A boundary that retries hydration after suspending does not report these
again. A dormant `<Hydrate>` boundary whose captures changed before it
activated repairs its list without reporting, including when a `@for` rendered
fewer items than the server.
