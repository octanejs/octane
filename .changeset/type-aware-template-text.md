---
'octane': patch
---

Recognize unshadowed String conversions as template text and add an opt-in Node-only TypeScript project adapter for string-child inference. Keep conversion calls intact, reject stale source facts, omit uncertain type proofs, and share the same text classification across client compilation, SSR, and hydration. Publish declarations for the compiler and adapter APIs.
