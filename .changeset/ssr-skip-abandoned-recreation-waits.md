---
'octane': patch
---

Reduce SSR latency for promises recreated by ancestor renders. Initialize the
recreation guard from the actual first pending pass and immediately retry when
switching to per-site replay, without waiting for an abandoned batch. Continue
observing abandoned rejections and preserve dependency-waterfall, abort, and
request-isolation behavior.
