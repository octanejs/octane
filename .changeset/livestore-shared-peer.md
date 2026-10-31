---
'@octanejs/livestore': patch
---

`@opentelemetry/api` is now a peer dependency (`^1.9.0`), as it is for `@livestore/react`, so the binding uses the application's OpenTelemetry API instead of installing its own. Install `@opentelemetry/api` next to `@octanejs/livestore` if your app does not already have it.
