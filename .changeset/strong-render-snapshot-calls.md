---
'octane': patch
'@octanejs/mcp-server': patch
---

Treat `"use strong"` as an author assertion that every user-authored render call
is a pure projection of immutable snapshots and witnessed inputs. Condition
local, dynamic, ordinary hook-shaped, callback-bearing, constructed, and tagged
call shapes without React hook-name heuristics, while preserving compiler-proven
hook setup, compatibility-mode live receivers, and changing event captures.
Witness callable and receiver identities alongside explicit inputs, compare
memoized component and ordinary-list projection inputs with `Object.is`, and
preserve optional, aliased, cyclic, function-valued, or lexically shadowed
setup-hook paths. Add
bounded diagnostics for detectable state-snapshot mutations, cross-row writes
from retained keyed scopes, and impure clock or random reads, and document the
assumptions the production memoizer trusts.

Expose the template-call memoization benchmark through the Octane MCP benchmark
tool.
