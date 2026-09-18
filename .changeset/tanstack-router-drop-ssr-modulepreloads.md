---
'@octanejs/tanstack-router': patch
---

Stop emitting `modulepreload` link tags for the whole boot chunk graph in SSR head output.

The manifest still carries `routes[*].preloads`, so client-side navigation preloading is unchanged; what is gone is the per-request document head spending nine `<link rel="modulepreload">` fetches on chunks the entry script already imports. On the Octane website (simulated-throttling Lighthouse, median of 3 cold runs) removing them moved LCP −9.8% and FCP −28%.
