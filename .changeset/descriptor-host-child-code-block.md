---
'octane': patch
---

A child `@{ … }` block inside a keyed element, `<noscript>`, `<html>`/`<head>`/
`<body>`, or a host the HTML parser would repair (such as a `<p>` containing a
`<div>`) now renders, on the client and the server, exactly as it does under an
ordinary element. The compiler builds those hosts as element descriptors, and
that path silently dropped the block, so `<p key={id}>@{ … }</p>` rendered an
empty `<p>`. A component that returned such a host with a setup-bearing block
kept the block on the client but not on the server, so hydration reported a
mismatch and rebuilt the subtree. A render-only block now groups its output
transparently. A block with setup runs in its own render scope and keeps its
hook state across parent updates.
