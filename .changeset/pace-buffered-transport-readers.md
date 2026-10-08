---
'octane': patch
---

Pace buffered streamed RPC and optional renderer-response readers with the shared host budget. Preserve ordered delivery and backpressure, and recheck cancellation after waits so a retired RPC pull cannot publish a stale buffered value.
