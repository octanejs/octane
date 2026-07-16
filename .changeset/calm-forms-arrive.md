---
'@octanejs/tanstack-form': patch
---

Add the Octane binding for TanStack Form 1.33.2, including the complete adapter
surface, native-input integration, upstream behavioral and type tests,
differential React parity coverage, TSRX-authored renderer modules, and
server-rendering support. Renderer-specific public types use Octane-prefixed
names without React type compatibility shims, and declaration companions are
checked against source-owned recursive contracts instead of manually unrolled
return types.
