---
'@octanejs/aria': patch
---

Synchronize number-field drafts with controlled values, locales, and formatting
options through `useLinkedState` instead of updating four state cells during
render. Preserve in-progress edits, parser and formatter behavior, user-selected
numbering systems, server rendering, and compatibility with Strong mode.
