---
"octane": patch
---

Render the remaining rows of a keyed list after one row suspends, so every row's `use()` starts or observes its data in the same pass and the boundary retries once. A list of N suspending rows used to retry once per row and re-render every earlier row on each retry.
