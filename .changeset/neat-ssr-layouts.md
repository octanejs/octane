---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
---

Report browser-repaired HTML nesting with authored locations during development SSR, and collect module style-map CSS while rendering so server and hydrated layouts use the same styles.

Negotiate streaming gzip in the built-in Node HTTP transport for eligible SSR and static text responses, including the `octane-preview` path.
