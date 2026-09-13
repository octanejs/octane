---
'octane': patch
---

Speed up server rendering by picking the escape pre-scan by string length in
`escapeHtml`: a stateless non-global regexp test for short strings, three
`indexOf` scans for long ones.

The previous global regexp paid `lastIndex` bookkeeping on every call; the
length split keeps the cheaper scan in each regime. ~20% faster median render
on the 500-card SSR benchmark with byte-identical output.
