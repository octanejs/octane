---
'octane': patch
---

Avoid rerendering memoized context consumers when only a sibling provider changes. Retain updates for real nearest-provider value changes and conservative invalidation for hosted, replayed, and externally invalidated contexts.
