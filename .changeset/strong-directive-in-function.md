---
'octane': patch
---

Report `"use strong"` inside a function or component body as
`OCTANE_STRONG_DIRECTIVE_PLACEMENT`. Strong mode applies to a whole module,
but a function-body prologue parsed as an ordinary directive and was ignored, so
the module compiled in compat mode with no diagnostic and Strong checks never
ran. The compiler, `slotHooks`, and the Volar diagnostics now reject it and
ask for the directive at the top of the file.
