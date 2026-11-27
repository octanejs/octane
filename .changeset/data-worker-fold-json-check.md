---
'octane': patch
---

A data worker that validates a read's reply or a feed event now checks once that JSON keeps it, in place of walking it twice before sending it to a tab as text.
