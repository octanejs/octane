---
'octane': patch
---

Keep query and derived computations attached to live signal inputs when their declarations are first resolved during historical hydration. Queries now reselect after later input changes without repeating a completed initial server request.
