---
'octane': patch
---

SVG-only tags (`g`, `rect`, `path`, `circle`, … — every tag with no HTML counterpart) now imply the SVG namespace in namespace-ambiguous positions: a component whose ROOT is such a tag, a value-position/`createElement` descriptor, fragment roots, and portal children targeting an SVG container. Previously these compiled/rendered as HTML-namespace elements (`HTMLUnknownElement`) that paint nothing inside an `<svg>` — a component returning `<g>…</g>` only worked if its markup lexically sat under `<svg>` in the same file. The inference table (`SVG_ONLY_TAGS`) is shared by the compiler's template namespacing and the runtime's de-opt reconciler; ambiguous names (`a`, `title`, `script`, `style`) keep the inherited namespace, matching browser foreign-content rules.
