---
"octane": patch
"@octanejs/vite-plugin": patch
---

Align the SSR API with React and reshape the render result to `{ html, css }`.

The octane-invented `render(Component, props) → { head, body, css }` is replaced by
React-aligned entry points:

- `octane/server` (mirrors `react-dom/server`):
  - `renderToString(element, props?, options?)` — a single synchronous pass; a Suspense
    boundary that suspends renders its `@pending` fallback (no awaiting).
  - `renderToStaticMarkup(element, props?, options?)` — clean, non-hydratable HTML (no block
    or head-adoption markers, no suspense seed script).
- `octane/static` (NEW subpath, mirrors `react-dom/static`):
  - `prerender(element, props?, options?)` — the await-everything behaviour of the old
    `render()`: all Suspense data resolves and success arms render, returning complete HTML.

All three return `{ html, css }`. The separate `head` field is gone — hoisted `<title>`/
`<meta>`/`<link>` fold into `html` (spliced into `<head>` when the render produced a
document, else prepended), matching React 19's resource hoisting. `css` remains a distinct
field (octane has scoped CSS that React core does not). `render` is removed; the vite
plugin's dev SSR now uses `prerender`.
