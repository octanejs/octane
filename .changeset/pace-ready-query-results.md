---
'octane': patch
---

Share the stream host budget when publishing ready query promise results, allowing input and other tasks to run between large bursts of independent query completions. Recheck request ownership after each wait so replacement and disposal cannot publish stale results.

Even a single successful query can wait for a later host task when the shared budget is exhausted, so a synchronous `renderToString` immediately after promise resolution may still render pending. Awaited `act()` now drains budget-paced query and stream publications as well as their renders; tests should await it instead of counting microtasks. Query rejections retain their existing prompt failure delivery.
