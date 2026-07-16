---
'octane': patch
---

Refresh suspended boundaries when newer props supersede their pending promise,
while keeping fallback-visible, fully staged transition groups together through
their DOM, ref, and layout-effect commit.
