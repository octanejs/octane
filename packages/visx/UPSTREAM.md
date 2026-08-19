# Upstream Visx audit

## Pin and oracle environment

| Field | Value |
|---|---|
| Package | `@visx/visx` |
| Version | `4.0.0` |
| Canonical release commit | `78839796081beb0370fc928cc922b21908bbabaf` |
| Current-master audit commit | `485c0359664ee8e612992defb16e1f035ed40b23` |
| React oracle | `react@19.2.7` and `react-dom@19.2.7` |
| React types oracle | `@types/react@19.2.17` and `@types/react-dom@19.2.3` |
| Claimed compatibility range | workspace `catalog:default` (`react`/`react-dom` `^19.2.7`, `@types/react` `^19.2.17`) |
| License | MIT |

Exact lockfile-resolved oracle versions are also recorded as immutable audit
metadata in [`audit/oracle-environment.json`](./audit/oracle-environment.json)
and hashed into the parity manifest lanes that inherit them.

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

## Test-suite disposition

The Visx monorepo contains package-local runtime and type suites across the
feature packages. Those tagged suites have not been vendored and adapted
one-for-one, so the parity manifest remains `recorded-unverified` with upstream
runtime and type suites recorded as present.

The bounded harness keeps a single repo-authored differential lane: three exact
representative public scenarios against `@visx/visx@4.0.0`. Package-authored
conformance, SSR, and hydration tests stay in ordinary shards and are classified
as Octane-only framework contracts; they are not claimed as adapted React
evidence.
