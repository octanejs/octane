---
'octane': patch
---

Enable the existing keyed-list purity and automatic memoization optimizations for
components authored with ordinary TSX/JSX returns. JSX lists now reuse unchanged
items like equivalent TSRX templates while preserving context updates, captured
values, component boundaries, and JSX children semantics. Native dense Arrays
retain the optimized path; custom or overridden map methods, sparse Arrays, and
additional map arguments preserve normal JavaScript behavior.
