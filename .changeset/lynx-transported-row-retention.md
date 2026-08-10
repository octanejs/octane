---
'octane': patch
---

Retain unchanged keyed component subtrees for asynchronous universal renderers,
avoiding redundant Lynx row renders while preserving context updates, native
listeners, host identity, effect lifetimes, and accepted-commit ordering.
