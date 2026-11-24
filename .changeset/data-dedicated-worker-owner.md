---
'octane': minor
---

`sharedOwner` runs the data worker as the page's own dedicated `Worker` where SharedWorker is missing or cannot start, such as in Chrome on Android, so the owner's requests, feeds and persistence stay off the main thread there too. The page's replicas of one partition share that worker; a tab's owner is not shared with other tabs. `serveDataOwner` now serves a page that connects to it as a dedicated Worker. A data worker that fails to load makes each of its replicas a local store at once, instead of after the heartbeat gives up, and a dedicated worker that stops answering is terminated and replaced.
