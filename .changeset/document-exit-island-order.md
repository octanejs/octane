---
'octane': patch
---

On an ordinary page exit, `installSignalDocumentLifecycle` now unmounts independent islands before it retires the document's signal owner. Island cleanups can read their document signals instead of hitting `ScopeDisposedError`, and live islands are no longer notified of the retirement. The owner still retires if an island's unmount throws.
