---
'octane': patch
---

Reconcile a shared octane/data tab's server-render seed with the other tabs. After hydrating, a replica offers each seeded value to the other tabs of its owner, with the time it loaded. A tab holding an older value takes it, and a tab holding a newer one offers its own back, so every tab shows the newest value without loading again. A replica that joins a feed connection standing at another position than its page's seed treats it as a gap, and reloads what the feed covers.
