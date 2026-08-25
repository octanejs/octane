---
'octane': patch
---

Allow nested TSRX `@{ ... }` child blocks to contain setup statements, hooks,
and no rendered JSX. Setup-bearing blocks now compile as scoped child render
bodies in client, server, and hydration output, while render-only blocks remain
transparent grouping.
