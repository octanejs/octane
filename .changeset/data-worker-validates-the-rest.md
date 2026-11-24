---
'octane': minor
---

A data worker given `contracts` now also validates a read's previews (in the order they were sent), a write's output and the reads its reply returns, and each feed event, for tabs of the same build, which adopt them without running the schemas on the page. A value that fails validation in the worker, or that a structured clone would change, is still validated in the tab.
