---
'@octanejs/lynx': patch
---

Restore the fast first mount for compiled keyed rows. Since the transport began encoding every message as a JSON string, the main thread has received each program run as fresh, mutable data. A fresh root's run mounts through the dense host record store only when the run is immutable. Every first mount therefore fell back to staging one record per host, about twice as slow for 1,000 rows. The main thread now freezes a fresh root's validated runs before it prepares them, as it already did for runs appended after first-screen adoption. Rendered output, events, and acknowledgements are unchanged.
