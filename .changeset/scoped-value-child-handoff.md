---
'octane': patch
---

Reuse scoped JSX value records when host classification hands them directly to the host's child block, avoiding duplicate descriptor construction while preserving context-scoped resolution.
