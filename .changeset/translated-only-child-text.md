---
'octane': patch
---

Keep updating an element's only text child after the browser translates the
page.

Chrome's page translator replaces each Text node with nested `<font>` wrappers
holding the translation and detaches the original node. Octane kept writing new
values into that detached node, so `<span>{message}</span>` and
`<span>{message as string}</span>` went on showing the stale translation. As
React's `setTextContent` does, the next update now replaces what the translator
put in the element with the new text. Switching that child to an element or to
nothing also clears the translation. Text that sits beside other children keeps
React's behavior: a translated sibling Text node is not rewritten.
