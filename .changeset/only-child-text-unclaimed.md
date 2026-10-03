---
'octane': patch
---

Discard and report server content that an only-child text hole cannot adopt during hydration.

A text hole that is its element's only child adopts the server's leading Text
node. When the server rendered something else there, such as an element or a
comment, hydration kept that content and appended the client's text after it.
It reported nothing, and every later update wrote the text beside the stale
server nodes. Hydration now removes that content, so the element holds only the
client's text. It reports the mismatch through `onRecoverableError` and, in
development, a located warning. `suppressHydrationWarning` silences the report,
here and when the client renders nothing over such content. An empty server
frame is not reported, the same as an empty element.
