---
'octane': patch
'@octanejs/mcp-server': patch
---

Allow statically named render methods to participate in production memoization
when a module opts into Strong mode's immutable snapshot contract. Preserve
compatibility-mode live receivers, hooks, refs, and changing event captures, and
add Strong diagnostics for detectable state-snapshot mutations and impure clock
or random reads during render. Clarify keyed row identity, logging, and callback
invalidation rules.

Expose the template-call memoization benchmark through the Octane MCP benchmark
tool.
