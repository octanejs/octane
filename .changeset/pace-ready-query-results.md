---
'octane': patch
---

Share the stream host budget when publishing ready query promise results, allowing input and other tasks to run between large bursts of independent query completions. Recheck request ownership after each wait so replacement and disposal cannot publish stale results.
