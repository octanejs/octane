---
'octane': minor
---

`octane/data` keeps durable writes across a restart. List them in `persist.journal: { writes, receipt }`. A listed write is saved to an encrypted journal, in the same storage as the cache, before it is sent. If the page closes before its outcome is known, the next start shows its edit again and reads `receipt` with the write's operation ID. An applied receipt keeps the edit, and any other rolls it back. The write is never sent twice. A write whose receipt cannot be read stays in the journal for the next start. Writes that this build no longer declares, or whose input their schema no longer accepts, are dropped. `retire()` clears the journal with the cache.
