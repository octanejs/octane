---
'octane': patch
---

Reduce renderer-free signal startup dependencies by separating native-control capture from optional island activation and keeping server stream observation mirrors out of the browser request engine. Preserve early input, stream cancellation, and per-consumer backpressure without changing author-facing APIs.
