---
'octane': patch
---

Server rendering no longer emits a style declaration whose value serializes to
nothing. `style={{ color: '' }}` produced `style="color:;"` on the server while
the client produced no style attribute at all, so the markup could not be
hydrated and the element was rebuilt. Empty, whitespace-only and
empty-after-unit-handling values are now skipped, matching the client and React.
