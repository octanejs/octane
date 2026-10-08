---
'octane': patch
---

Hydrate an empty `{x as string}` text hole that is the sole content of a fragment, directive arm, list item, or component children without a recoverable mismatch. The server now emits the empty-text stand-in for these positions, as it already did for text holes with siblings, so hydration adopts the server DOM instead of regenerating it.
