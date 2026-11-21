---
'octane': patch
---

`OctaneCompat` now commits prop and React context changes to an island hidden by React
`Activity`, as React does for a hidden React child. The island re-renders and
runs its insertion effects while layout effects, passive effects, and refs stay
disconnected until reveal.
