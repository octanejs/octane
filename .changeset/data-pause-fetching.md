---
'octane': minor
---

Pass `{ fetch: false }` to a read handle's `subscribe` or `{ suspend: false, fetch: false }` to `useRead` in Octane and React to keep receiving cached data and updates while pausing automatic fetches for that subscriber.
