---
'octane': patch
---

React Float conformance evidence, plus two small fixes it surfaced.

The 121 planned `ReactDOMFloat-test.js` parity-ledger cases are all
dispositioned: 59 now carry executable adapted evidence (41 newly ported
conformance tests across three suites plus links into the existing Float/hint
suites), 54 are documented non-goals/divergences with per-case rationale
(suspensey commits, whole-document containers, Fizz bootstrap/external-runtime
protocol, `<img>`-preload scanning, SuspenseList, shadow-root scoping,
streamed-boundary head content), and 8 stay planned against two newly-filed
engine gaps, three warning-message families, and server-side hoistable
prioritization ordering.

Fixes: the document-metadata hoist partition is now HTML-scoped — nothing
hoists from an SVG lexical context (a precedence link inside `<svg>` no longer
becomes a stylesheet resource; `foreignObject` re-enters the HTML rules) — and
`preinitModule` with an invalid `as` now warns in development as documented
instead of failing silently.
