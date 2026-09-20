---
'octane': patch
---

Release completed streamed signal channels after transport acknowledgement, count only live channels against the automatic stream limit, and drain ready channels without rescanning completed history. Reuse serialized frame byte counts without changing the wire format.

Treat streamed signal and NDJSON timeouts as inactivity limits rather than total response deadlines. Pause producer timeouts during backpressure and renew browser result timeouts on accepted progress, preserving cancellation, replay protection, and byte and mailbox limits.

Cancel abandoned injection producers when a streaming renderer fails or its consumer cancels, including producers paused while waiting for transport acknowledgement.
