---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/rspack-plugin': patch
---

Add a DOM-free universal runtime entry, generic renderer validation contracts,
an explicit host microtask scheduler option, and compile-only runtime/thread
metadata for native universal integrations. Let Rspack integrations select a
graph-local Octane runtime while keeping cache and module build metadata
distinct across universal runtime specializations. Validate renderer-selected
project `.ts` and `.js` helpers without changing which compiler owns their
output, and keep nested renderer diagnostics scoped to their authored regions.
