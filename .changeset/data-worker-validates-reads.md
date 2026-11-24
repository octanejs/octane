---
'octane': minor
---

`createDataOwner` and `serveDataOwner` take `contracts`, the build's reads, writes and feeds (`import { contracts } from 'octane/data/manifest'` in the data worker). With them the owner validates each read's reply with its output schema in the worker, for tabs of the same build, and the tab adopts the validated value without running the schema on the page. A reply that fails validation, or whose validated value a structured clone would change (a class instance, for one), is still validated in the tab. A refresh of 5,000 zod-validated rows took 1.24 ms of the page's main thread instead of 4.25 ms in Chromium.
