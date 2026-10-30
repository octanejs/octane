---
'octane': patch
---

Stop Vite builds from warning about `'use client'` directives.

Rolldown 1.2.16 and later (Vite 8.3) warns once for every module that opens with
a directive. Ported React libraries keep upstream's `'use client'` on each module,
so a small `@octanejs/base-ui` app printed 81 of these warnings per build. Octane
has no Server Components, so the directive has nothing to preserve. The Octane
Vite plugin now drops that one warning, as `@vitejs/plugin-react` does. Warnings
for any other directive still reach your build's `onLog` and `onwarn` handlers.
