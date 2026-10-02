---
'octane': patch
---

Keep `import.defer()` deferred in plain hook modules that production client builds reprint; it previously compiled to an eager `import()`.
