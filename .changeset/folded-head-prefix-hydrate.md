---
'octane': patch
---

`hydrateRoot` now adopts a container filled with the whole `html` of a
body-only render that hoisted document metadata. The default
`headChannel: 'fold'` prepends each hoisted `<title>`, `<meta>`, or `<link>`
ahead of the body markup, as React 19 does. Hydrating that container reported
a recoverable hydration mismatch and rebuilt the entire root on the client
(in development it also logged that the client expected the root element but
the server rendered a comment). `hydrateRoot` now moves each folded metadata
entry into `document.head` and adopts it there, which matches a client render.
Folded Float stylesheets, scripts, and resource hints stay in place and are
skipped.
