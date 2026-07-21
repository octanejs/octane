---
'@octanejs/rspack-plugin': patch
'octane': patch
---

Add Rspack layer specializations for renderer configuration, universal runtime
identity, and exact runtime aliases. Include every specialized renderer graph
in dependency discovery and persistent-cache identity.

Allow universal renderers to declare first-screen event prop patterns and opt
into main-thread render-only compilation that erases background-owned effect
and ref callbacks and replaces event closures with lightweight listener
sentinels.
