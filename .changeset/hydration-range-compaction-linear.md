---
'octane': patch
---

Make hydration of deeply nested, coextensive component wrappers scale linearly.

Hydration now remembers matching nested marker pairs for the lifetime of the
adoption pass, resolves compacted range owners through a deferred parent chain,
and removes contiguous redundant marker runs in one DOM mutation. A production
SSR benchmark at 512 wrappers dropped from 39.2 ms to 4.9 ms while preserving
server-node adoption, delegated interaction, logical marker multiplicity, and
clean unmount behavior.
