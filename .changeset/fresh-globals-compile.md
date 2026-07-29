---
'octane': patch
---

Use the current TypeScript module-declaration `kind` field throughout Octane's
compiler. Runtime client and server output continues to erase ambient global
declarations, while editor `to_ts` output preserves `declare global` as a valid,
type-checkable global augmentation.
