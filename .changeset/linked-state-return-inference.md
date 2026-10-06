---
'octane': patch
---

Infer `useLinkedState`'s value from the reconciler's return type when the
reconciler declares an unannotated `previous` parameter. The value was
previously `unknown`. An annotated `previous`, typed options, or explicit type
arguments still declare the value type. With none of them, `previous.value`
reads as `unknown`; annotate the return type when the reconciler reads it.
