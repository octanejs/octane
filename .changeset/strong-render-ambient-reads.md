---
'octane': patch
'@octanejs/mcp-server': patch
---

Reject known ambient browser-state reads during Strong renders with `OCTANE_STRONG_RENDER_AMBIENT_READ`, including browser handle aliases and `globalThis` property reads outside known standard language builtins. Preserve shadowing, events, effects, external-store snapshot callbacks, and lazy state initialization, and document how to render subscribed snapshots safely across server and client.
