---
'@octanejs/codemod': patch
---

Fixes from migrating the repo's React benchmark apps:

- `if (c) return <A />;` guards in a component become `@if`/`@else`. Before,
  they rendered through runtime element descriptors.
- `root.render(<App />)`, `root.render(createElement(App, props))` and
  `hydrateRoot(c, <App />)` mount the component directly, so the generic
  element renderer stays out of the bundle (7–21 kB gzip in the apps).
- `renderToString` and `renderToStaticMarkup` read `.html`, since Octane returns
  `{ html, css }`.
- `{x && <A />}` lowers to `@if` when `x` is a `const` holding a comparison.
- Every HTML page beside the sources is updated, not only `index.html`, and
  imports through a tsconfig `paths` alias (`~/components/Card`) of a renamed
  module are rewritten like relative ones.
- `react-dom/server.edge` and `react-dom/server.bun` map to `octane/server`, and
  `@tanstack/react-start` maps to the `@octanejs/tanstack-start` framework
  integration.
- TSRX written for React (`@tsrx/react`), which the codemod cannot read, is
  reported instead of skipped silently.
- A TanStack root shell's `<html>`, `<head>` and `<body>` become the router's
  `Html`, `Head` and `Body`, which own the hydration root.
- A context made on either branch of a conditional, and `C.Provider` read as a
  value, are ported like `<C.Provider>`.
- React names read only in types import as `type`, so bundlers elide them.
- A `.map()` whose row writes an outer variable stays a `.map()`; `@for` rows
  may be skipped.
- `//` and `/*` in element text stay text in TSRX.
- `typeof children === 'function'` also checks `!isChildrenBlock(children)`.
- `declare module` augmentations follow their package to its binding,
  `@visx/<feature>` imports map to `@octanejs/visx/<feature>`, and a package's
  `/react` entry without a binding is reported.
- `flushSync` and React Three Fiber imports are reported: Octane's `flushSync`
  leaves the commit's `useEffect`s queued, and three.js scenes belong in
  `.three.tsrx` modules.
- A Strong fallback no longer leaves a blank line where `"use strong"` was.
