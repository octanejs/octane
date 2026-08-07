---
'octane': patch
---

Update only the previously selected and newly selected keyed-list rows when the
production compiler can prove that a row's selection depends solely on its own
key. Preserve component rerenders, immutable updates, and existing lifecycle
behavior without requiring a new public API.
