---
'octane': patch
---

React-parity attribute aliases: the canonical camelCase JSX props now write the attribute the browser actually parses — `strokeWidth` → `stroke-width`, `acceptCharset` → `accept-charset`, `xlinkHref` → `xlink:href` (React 19's `aliases` table, plus the namespaced xlink/xml props) — on the client (dynamic bindings, spreads, de-opt props), the SSR serializer, and compiled static attributes. Matters most on SVG hosts, whose `setAttribute` preserves case: an unaliased `strokeWidth` landed verbatim as a dead attribute and never styled the element. Additive — native hyphenated spellings still write verbatim; custom elements keep raw names.
