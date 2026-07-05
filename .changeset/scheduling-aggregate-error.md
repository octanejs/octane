---
'octane': patch
---

Multiple unhandled root errors in one flush now aggregate (React parity): when several roots throw during a single synchronous flush and no boundary handles them, the flush rethrows an `AggregateError` carrying every error instead of silently keeping only the first. A single unhandled error still rethrows as-is; failed roots still unmount and the rest of the queue still commits. Also: SSR spread attributes now skip function/symbol values and `suppressContentEditableWarning` (mirroring the client's setAttribute policy).
