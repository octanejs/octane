---
"octane": patch
---

Keep reader ownership for a `derived$` or `query$` producer called through a namespace import behind a type assertion, such as `(Signals as typeof Signals).derived$(compute$)`. It now gets the same per-reader producer copy as a direct import.
