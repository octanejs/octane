---
'octane': patch
---

Hydrating an `@for` that the server rendered with no items while the client has
items now reports the mismatch once, at the list, with one recoverable error.
It previously logged a second "another list item" diagnostic, and a third when a
pending sibling replayed the hydration attempt. The diagnostic mentions `@empty`
only when the server rendered that arm.
