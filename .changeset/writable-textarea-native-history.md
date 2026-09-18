---
'octane': patch
---

Preserve native Undo/Redo grouping when a writable textarea signal echoes an
accepted native edit. Different programmatic values still update the textarea's
reset baseline, and scalar or read-only values keep controlled-value mirroring.
