---
'octane': patch
---

Adopt the server's text at a renderable hole in a fragment that a component adopts in place during hydration. When a component call finds no server range of its own, because the server rendered another arm or component inline there, its fragment template adopts those server nodes in place, and the server framed none of that markup's holes. A `{value}` hole then took the server's text node as its own end marker and inserted a second copy before it, so the page showed the text twice. The hole now adopts that text, or the element an element value renders, and updates it in place. A `{null}` hole at the end of such a fragment no longer claims the server node after it as the fragment's content, so hydration removes that stale node and reports it once instead of keeping it on screen.
