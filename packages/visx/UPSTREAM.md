# Upstream Visx audit

This port was audited against two immutable Airbnb Visx revisions:

- release `v4.0.0` at `78839796081beb0370fc928cc922b21908bbabaf`, used as the
  installed React runtime/type oracle;
- current 4.x `master` at `485c0359664ee8e612992defb16e1f035ed40b23`, used to
  pin the public additions awaiting the next registry release.

## Public package inventory

The Octane package exposes 49 entry points: its aggregate root, 40 feature
roots, and eight nested paths. Each `@visx/<feature>` package maps to
`@octanejs/visx/<feature>`; nested paths retain their upstream suffix.

The 40 roots are `a11y`, `annotation`, `axis`, `bounds`, `brush`, `chart`,
`chord`, `clip-path`, `curve`, `delaunay`, `drag`, `event`, `geo`, `glyph`,
`gradient`, `grid`, `group`, `heatmap`, `hierarchy`, `kernel`, `legend`,
`marker`, `mock-data`, `network`, `pattern`, `point`, `react-spring`,
`responsive`, `sankey`, `scale`, `shape`, `stats`, `text`, `theme`,
`threshold`, `tooltip`, `voronoi`, `wordcloud`, `xychart`, and `zoom`.

The nested paths are `a11y/react`, `a11y/server`, `axis/react`, `scale/react`,
`shape/react`, `theme/react`, `tooltip/floating`, and `voronoi/react`.

The v4.0.0 aggregate has 31 namespaces. Current master adds `A11y`, `Chart`,
`Kernel`, and `Theme` for an exact 35. Chord, Delaunay, ReactSpring, Sankey, and
Stats remain direct-only upstream packages. Runtime tests compare every released
namespace in both directions, pin the exact current-master keys, and reject both
missing and extra exports. Compile-time assertions do the same for released
types, with explicit assertions for the documented Octane ref/context/ID
differences.

## Source ownership

Framework-neutral D3, math, data, scale, path, accessor, and formatting modules
are retained as TypeScript and use the upstream D3 ESM packages directly. All
258 React-owned component and hook modules are TSRX and pass Octane's client and
server compiler modes. React runtime imports, `react-dom`, `react-use-measure`,
`@react-spring/web`, and `@use-gesture/react` are absent from runtime source.

## Non-library exclusions

- `@visx/demo` is the non-importable Next.js documentation/gallery application.
- `@visx/registry` is private release/registry tooling.
- `@visx/vendor` is upstream's dual CJS/ESM D3 packaging layer. Octane is
  ESM-first and imports the same pinned D3 modules directly.

Those are the only exclusions. They expose no supported web React library API.
Behavioral divergences required for deterministic SSR, native Octane events,
refs-as-props, and animation/measurement adapters are recorded in
[`status.json`](./status.json) and the package [`README.md`](./README.md).
