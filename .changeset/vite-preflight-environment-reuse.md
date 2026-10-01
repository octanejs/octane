---
'octane': patch
---

Reuse the Vite plugin's preflight classification of an unchanged module across
client environments that share one plugin instance, such as Vite's
`builder.sharedPlugins` or a dev server with several client environments.

Before this change, every environment parsed and reclassified the same source
again, including host-owned TypeScript that the plugin passes through
unchanged. The plugin now keeps a small summary per module, keyed by
environment, specialization flags, and the full module ID, and checked against
a digest of the exact source. It holds neither the source nor its AST. The
summary is cleared when the compiler is reset and on every watch event. The
compiler still parses each module for its own transform, and output is
unchanged.
