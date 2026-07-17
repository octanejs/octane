---
'octane': patch
---

Fix TSRX shorthand components that return before reaching their trailing
template. Early values, bare or undefined returns, and trailing compiled JSX now
reconcile through one returned-output path across client rendering and
hydration; folded control-flow cache dependencies stay scoped correctly, and
incompatible HMR edits safely invalidate the module.
