---
'octane': patch
---

Streaming SSR document mode: when a `StreamOptions.injection` source is present and the shell renders a document, the response now leads with `<!DOCTYPE html>`, renderer-owned leading scoped styles (and the hoisted-head buffer) fold inside the authored `<head>`, and the held `</body></html>` tail closes the stream. `StreamInjectionSource` gains an optional `renderComplete()` callback — invoked exactly once when the renderer finishes producing markup (success or degraded abort/error path) so sources can finalize asynchronous serialization and then settle `done`. Without `injection`, streamed output is unchanged.
