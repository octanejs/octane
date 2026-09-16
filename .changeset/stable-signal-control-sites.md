---
'octane': patch
---

Derive direct signal binding and writable-control identities from authored source positions rather than generated component helper names. This fixes server/client identity mismatches for controls nested in conditional fragments, loops, and switch branches. Rebuild and deploy matching server and client output together because the compiler site-identity version changes.
