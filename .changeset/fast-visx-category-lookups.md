---
'@octanejs/visx': patch
---

Reuse categorical-domain lookup work in `useCategoricalScale` and
`useColorScale` instead of scanning the whole domain for every color assignment.

Small domains keep the existing linear path. At the measured 64-key crossover,
the indexed path already amortizes its construction within one complete-domain
pass. In the same-run 4,096-key benchmark, including construction, lookup time
drops from about 1.59 ms to 0.04 ms per 1,000 calls while preserving first-match
duplicates and missing-key fallbacks.
