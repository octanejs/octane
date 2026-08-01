---
'@octanejs/astro': patch
---

Add `@octanejs/astro` — Astro islands integration using `octane/compiler/vite`, hydratable SSR, and `hydrateRoot`. Strip leftover `<!--astro:end-->` markers before hydrate when Astro's island CE leaves them in place.
