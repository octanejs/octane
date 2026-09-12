---
"@octanejs/tanstack-db": patch
"octane": patch
---

Update the TanStack DB binding to React DB 0.3.8 and DB core 0.9.0, including database providers, hydration boundaries, derived query identity and awaitable pagination.

Re-read external-store snapshots after subscribing so synchronous initialization without a notification reaches the mounted or hydrated component. This removes the DB adapter's deferred initial notification workaround.
