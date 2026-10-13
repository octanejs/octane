---
'octane': patch
---

Hydrating applications without a `<Hydrate>` island no longer ship the island-only parts of hydration: resuming an activation that suspended, settling the island's trailing server content, and keeping the server nodes an island attempt changed. About 0.4 kB of minified runtime leaves bundles that call `hydrateRoot` without islands. Behavior is unchanged.
