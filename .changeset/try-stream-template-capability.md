---
'octane': patch
---

Keep the streamed-boundary validator out of client-only apps that use
`@try`/Suspense. Mounting a boundary previously retained the check for a
streamed shell's pending `<template>` sentinel, and the hydration range-marker
helpers behind it, even in apps that never call `hydrateRoot`: about 400 B gzip.
Claiming that sentinel is now a hydration method, so client-only apps drop it.
Hydration behavior is unchanged.
