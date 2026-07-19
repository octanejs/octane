---
'octane': patch
---

Keep a return slot mounted through the passthrough-hydration componentSlot
route on that route while the returned component identity is unchanged. The
first post-hydration re-render previously flipped the slot to the childSlot
regime and disposed it, remounting the entire adopted subtree — visible in
TanStack Start apps as the whole page tearing down (losing all component
state) on the first router event after hydration.
