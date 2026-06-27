---
"@octanejs/stylex": patch
---

The Vite plugin now exposes `api.getCss()` — the aggregated atomic StyleX sheet — so a dev SSR server can inline the styles into the server-rendered `<head>` and avoid a flash of unstyled content on first paint. In dev, `virtual:stylex.css` is served as JS that only injects styles after the client runs, so without this the server HTML paints unstyled. Call it after the route's modules have been transformed (e.g. after `render()`); a production build still extracts the sheet to a `<link>`.
