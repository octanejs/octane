---
'octane': patch
---

Remove browser-translation DOM accommodation from binding adoption and text updates. Framework-owned text and closed child lists must retain their original topology; applications should opt owned content out of browser translation in their initial server-rendered HTML. Preserve existing compiled host-based text writer calls and unrelated topology validation, journaling, and performance improvements.
