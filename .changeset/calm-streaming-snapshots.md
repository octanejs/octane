---
'octane': patch
'@octanejs/mcp-server': patch
---

Reuse unchanged populated SSR replay snapshots and pending streaming settlement
recorders across retry waves. Preserve metadata rollback, promise identity,
cancellation, and request cleanup. Add the SSR replay and streaming benchmark
suite to repository automation.
