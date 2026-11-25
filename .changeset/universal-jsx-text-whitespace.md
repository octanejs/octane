---
'octane': patch
---

Keep the edge whitespace of JSX text in universal plans the way the DOM template does. `Before <span>middle</span>` no longer lowers to the text `"Before"` glued to the span, multi-line text joins lines like the DOM template, and tabs inside a line become spaces. Whitespace-only text between elements is still dropped.
