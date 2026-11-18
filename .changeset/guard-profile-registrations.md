---
'octane': patch
---

Guard compiler-emitted profile registrations with `typeof Component === 'function'`, so a route module still loads when TanStack's route code-splitter moves its component into a separate chunk.
