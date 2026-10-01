---
'octane': patch
---

Strong mode now rejects `document.getElementById()`, `querySelector()`,
`querySelectorAll()`, and `getElementsByClassName()` when a literal selector
matches a literal `id` or class that the same component renders
(`OCTANE_STRONG_OWN_MARKUP_QUERY`). Attach a ref to the element instead. Portal
targets, dynamic selectors, and markup rendered by other components stay valid.
Compatibility mode and emitted code are unchanged.
