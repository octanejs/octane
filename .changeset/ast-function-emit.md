---
'octane': patch
---

The client compiler now builds each component function as a single AST
(`@tsrx/core` builders end to end — bindings, path walks, control-flow call
sites, memo regions, sub-templates) and prints it once with esrap, replacing
the string-assembled function interiors and the custom per-fragment source-map
stitching. Emitted programs are structurally identical (verified by parsing
old and new output across every fixture and mode); formatting follows esrap's
printer, and generated code is marginally smaller. Function-level source maps
are now complete by construction. The module frame and server emitter keep
their existing emission pending the next milestones.
