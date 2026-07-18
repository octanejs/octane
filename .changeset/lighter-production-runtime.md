---
'octane': patch
---

Reduce production framework payloads by keeping transition swaps, generic
component returns, and generic attribute routing out of bundles that do not use
them. Production compilation now preserves void-component proofs across local
module imports, lowers null-only component guards and statically authored error
boundaries, and emits narrow boolean/ARIA attribute writers when their full
semantics are known at compile time.
