---
'octane': patch
---

Reduce the cost of potential signal bindings in ordinary code. A prop-driven attribute such as `title={props.label}` now passes its statically selected scalar writer to the binding, so production bundles no longer retain the generic attribute route with its form-control writers and DOM routing tables (−5.1 KB gzip for a one-component counter). Text and attribute bindings no longer retain the restored-textarea hydration helper. In modules that import `octane/signals`, an object-literal `style` with scalar values is written directly and allocates its owning Block only once a signal handle appears, and components that evaluate no authored code skip the native-read bracket.
