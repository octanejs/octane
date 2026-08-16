---
'octane': patch
---

Parse authored TSRX modules through the native `oxc-tsrx` compatibility layer in Node to reduce compiler latency while preserving Octane's existing AST, source-map, stylesheet, and diagnostic contracts. Browser and other non-Node compiler consumers continue to use the pure-JavaScript `@tsrx/core` parser.
