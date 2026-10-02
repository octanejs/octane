---
'octane': patch
---

Give a signal component below returned JSX the same instance on the server and
in the browser. A `.tsx` component, or a plain function in a `.tsrx` module, that
returns host elements no longer adds a level of its own to the identity of the
signal and query declarations below it, and neither does a dynamic tag that
resolves to a host element. Hydration now resumes the server's cells and query
results for those components instead of starting fresh ones.

Instance identity now follows authored component invocations only, so it no
longer changes when a module starts importing `octane/signals`.
