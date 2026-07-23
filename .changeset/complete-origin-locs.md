---
'octane': patch
---

Every node the compiler prints now carries an origin location: synthetic
scaffolding (hook-slot arguments, withSlot wrappers, inferred dependency
arrays, scoped-CSS class bakes, warm plans, lowered guards, profile
instrumentation, fragment renderers, and the rest) inherits the position of
the authored construct it derives from, while authored subtrees keep their
exact positions. Emitted source maps gain segments for previously unmapped
generated code, laying the groundwork for source↔output navigation tooling.
Manual AST construction was replaced with `@tsrx/core` builders (which attach
origin locations directly) across the compiler. The test suites enforce
completeness (`OCTANE_COMPILE_ASSERT_LOC`, set in `vitest.config.js`): a
printed node without an origin fails with the offending construction listed.
