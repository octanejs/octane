---
'octane': patch
---

Drop element-descriptor handling from renderable holes and child lists in applications that never build an element value. Without an element factory, `childSlot` and the keyed child list keep no component-descriptor, Fragment, keyed-element or host-descriptor code. Strong-mode and pure `.tsrx` apps whose holes hold text therefore ship less runtime. Applications without holes also drop the descriptor classification helpers, and the destination-namespace lookup that only opaque templates need.
