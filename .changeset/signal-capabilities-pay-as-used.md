---
'octane': patch
---

Ship less signal code. An application that declares signals but renders no
renderable hole no longer bundles the hole and descriptor-reconciliation
machinery (about 19 kB gzip off a `signal$` counter). Streamed signal results
now enter the engine through their own module, so a route that declares
signals no longer carries the stream and request code that only the lazily
loaded streamed-signals receiver uses. Browser bundles also drop the server
query-attempt observer.
