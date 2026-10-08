---
'octane': patch
---

Pace buffered streamed RPC and optional renderer-response readers with the shared host budget. Preserve ordered delivery and backpressure, and recheck cancellation after waits so a retired RPC pull cannot publish a stale buffered value.

Observe server result rejections when the producer is created so a paced consumer can delay its first read without an unhandled rejection. The stream still delivers the sanitized error frame.
