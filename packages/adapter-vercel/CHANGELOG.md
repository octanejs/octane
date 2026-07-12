# @octanejs/adapter-vercel

## 0.0.2

### Patch Changes

- 6d332ad: New package: Vercel adapter (Build Output API v3). `adapter: vercel()` in octane.config.ts makes `vite build` emit `.vercel/output` — the hashed client assets as static files plus one self-contained Node serverless function wrapping the SSR handler (the plugin's server bundle is self-contained, so no dependency tracing is needed). Options cover the serverless function (runtime/regions/memory/maxDuration), ISR, cleanUrls/trailingSlash, extra headers, and redirects; routing is filesystem-first with everything else — including the 404 catch-all — server-rendered by the function.
