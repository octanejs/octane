---
'octane': patch
---

Streaming SSR: a shell whose root renders `<html>` now always leads the response with `<!DOCTYPE html>` — React Fizz parity, no longer gated on the `injection` document mode. The buffered renderers (`renderToString`, `renderToStaticMarkup`, `prerender`) stay doctype-free, also matching React.
