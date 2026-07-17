---
'octane': patch
---

Add an external hydration ownership marker for framework integrations that
serialize thenable values outside Octane's suspense seed protocol.

Add an explicit hydration range boundary for document-shell integrations that
hydrate a nested application container while preserving outer component
lifecycles and portals.

Preserve authored function-declaration hoisting across client, server, and HMR
compilation so earlier route and configuration objects capture live component
bindings without changing variable-component TDZ semantics.

Keep streamed suspense boundaries resumable when compiled children pass
through descriptor-based host wrappers, and expose the server no-op reset
function to authored `@catch(error, reset)` arms.

Preserve Node package-import aliases while classifying Vite server imports so
Nitro production builds can compile their virtual server modules.
