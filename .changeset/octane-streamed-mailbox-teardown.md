---
'octane': patch
---

When a pre-module receiver mailbox exists, restore it on disposal so late inline frames can be received. Use suspension to fence late frames when no prior receiver exists.
