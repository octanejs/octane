---
'octane': patch
'@octanejs/mcp-server': patch
---

Reject render-time reads of reassigned module-scope `let` and `var` bindings in Strong modules with source-located diagnostics. Keep compatibility modules and event, effect, and deferred reads unchanged, and document the snapshot-safe alternative.
