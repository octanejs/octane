---
'octane': patch
---

Discard a mismatched server node inside a hookless component's host during hydration. A hookless component renders into the element its call sits in, which can differ from the parent of the enclosing block's range, for example a `<section>` inside an `@if` arm. When its template did not match the server node there, hydration kept the stale server node on screen and inserted the client's element beside it. Hydration now builds the client's element in that node's place, including when the node was the host's last child, and reports the mismatch once.
