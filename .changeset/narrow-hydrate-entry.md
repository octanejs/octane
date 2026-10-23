---
'@octanejs/vite-plugin': minor
'@octanejs/app-core': minor
'octane': patch
---

Production Vite builds now ship a hydrate entry sized to the app. When every
hydrated page and layout is a proven void `@{}` component and no root boundary
is configured, the entry hydrates without returned-value reconciliation. Root
boundary, independent island and streamed signal code ships only when the
build configures or compiles that feature. A one-button RenderRoute app's
initial JavaScript drops from 86.2 kB to 39.9 kB gzip.
