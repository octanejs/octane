---
'octane': patch
---

Encode a keyed component descriptor's key once per server render path.

During SSR, a keyed component descriptor already carries its key in the
enclosing child identity scope. Since async signals, the component invocation
also appended a second encoding of the same key, which added one key encoding
and its UTF-16 scan per keyed descriptor row. The duplicate is gone. Replay
identity is unchanged, and signal instance keys still use the descriptor key.
