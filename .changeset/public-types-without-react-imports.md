---
'octane': patch
---

Give `AriaRole`, `HTMLAttributeAnchorTarget`, `HTMLAttributeReferrerPolicy`, and
`HTMLInputTypeAttribute` their own declarations in Octane, and use them for the
host `role`, `target`, `referrerPolicy`, and `<input type>` props. A library that
exports an inferred host prop type now emits declarations that import `octane`,
not `react`, so apps without `@types/react` no longer fail with
"Cannot find module 'react'" or see those props become `any`. The types still
equal React's.
