---
'octane': patch
---

A server render's data store can take each feed's position before its first read: pass the page's feeds as `createDataStore({ feeds })` on a store with no `listen`. Its seed carries the positions, so the browser's feed resumes from before the page's values loaded and replays a change made before it connected. A feed handler that resumes yields its position first when `call.cursor` is null.
