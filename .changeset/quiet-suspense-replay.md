---
'octane': patch
---

Keep a committed universal `@pending` boundary retrying when a replacement
attempt is aborted or its host preparation fails. A later `prepare()` takes
over that retry instead of letting it discard the newer attempt.
