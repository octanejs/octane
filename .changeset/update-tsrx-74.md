---
"octane": patch
---

Update the TSRX compiler dependency to `@tsrx/core@0.1.67` from tsrx-org/tsrx#74 and preserve matching sibling selectors (`+` and `~`) at the top of a style scope and inside branch fragments. Unmatched selectors remain pruned, and a scoped block still never styles its containing element.
