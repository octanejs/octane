---
'octane': patch
---

Compiler-inferred component memoization now admits destructured props
parameters. `function Child({ rows })` is the same one-props snapshot as
`function Child(props)`, so production call sites of such components gain the
whole-region dependency cache and skip the child entirely when their props are
reference-stable — patterns that evaluate expressions of their own (defaults,
computed keys), bind `current`, or use array destructuring still fall back.
Call-site eligibility is also no longer vetoed body-wide by an unrelated
`ref.current` or live-import member read elsewhere in the parent: the reads
that actually flow into a site (directly or laundered through a local) still
reject that site, everything else keeps its region.
