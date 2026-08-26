---
'octane': patch
'@octanejs/mcp-server': patch
---

Treat `"use strong"` as an author assertion that every user-authored render call
is a pure projection of immutable snapshots and witnessed inputs. Condition
local, dynamic, hook-shaped, callback-bearing, constructed, and tagged call
shapes without React hook-name heuristics, while preserving compatibility-mode
live receivers and changing event captures. Add bounded diagnostics for
detectable state-snapshot mutations and impure clock or random reads, and
document the assumptions the production memoizer trusts.

Expose the template-call memoization benchmark through the Octane MCP benchmark
tool.
