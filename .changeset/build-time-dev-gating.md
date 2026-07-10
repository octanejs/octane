---
'octane': patch
---

Runtime: dev-only diagnostics are now gated behind `process.env.NODE_ENV !== 'production'` so bundlers strip them from production builds — hydration-mismatch warnings, controlled-input/select dev warnings (flip, missing-onInput, select value shape), the `act()` environment warning, DOM-prop hints (autofocus/defaultvalue casing, non-boolean attributes, lowercase `on*` handlers, object attribute stringification), the unkeyed-array-child warning, and the `use()` waterfall/uncached-promise hints. Behavior in dev and tests is unchanged (the token folds only under a bundler define); the framework chunk of a production app build shrinks ~7% gzip.
