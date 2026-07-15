# `@octanejs/visx`

The complete current Airbnb Visx 4.x visualization toolkit for Octane. The
package keeps the upstream aggregate API and exposes every public feature package
as a subpath:

```tsrx
import { AxisBottom, AxisLeft } from '@octanejs/visx/axis';
import { scaleBand, scaleLinear } from '@octanejs/visx/scale';
import { Bar } from '@octanejs/visx/shape';

export function Chart(props) {
  const x = scaleBand({ domain: props.data.map((d) => d.name), range: [0, 320] });
  const y = scaleLinear({ domain: [0, Math.max(...props.data.map((d) => d.value))], range: [180, 0] });
  return (
    <svg width={360} height={220} aria-label="Values by name">
      <g transform="translate(30,10)">
        {props.data.map((d) => (
          <Bar key={d.name} x={x(d.name)} y={y(d.value)} width={x.bandwidth()} height={180 - y(d.value)} />
        ))}
        <AxisBottom top={180} scale={x} />
        <AxisLeft scale={y} />
      </g>
    </svg>
  );
}
```

The root `@octanejs/visx` export matches upstream `@visx/visx` exactly. Atomic
imports map mechanically: `@visx/xychart` becomes `@octanejs/visx/xychart`,
`@visx/gradient` becomes `@octanejs/visx/gradient`, and so on. The current 4.x
master additions are also available through `a11y`, `chart`, `kernel`, and
`theme`, including the upstream `react`, `server`, and `floating` nested
subpaths. In Octane, the upstream `/react` names remain compatibility entry-point
names; their implementations use Octane.

The package ships 49 public entry points: the aggregate root; all 40 feature
roots (`a11y`, `annotation`, `axis`, `bounds`, `brush`, `chart`, `chord`,
`clip-path`, `curve`, `delaunay`, `drag`, `event`, `geo`, `glyph`, `gradient`,
`grid`, `group`, `heatmap`, `hierarchy`, `kernel`, `legend`, `marker`,
`mock-data`, `network`, `pattern`, `point`, `react-spring`, `responsive`,
`sankey`, `scale`, `shape`, `stats`, `text`, `theme`, `threshold`, `tooltip`,
`voronoi`, `wordcloud`, `xychart`, and `zoom`); and the eight upstream nested
paths `a11y/react`, `a11y/server`, `axis/react`, `scale/react`, `shape/react`,
`theme/react`, `tooltip/floating`, and `voronoi/react`. All 258 React-owned
component and hook modules are authored as TSRX; D3, math, data, and accessor
utilities stay framework-neutral TypeScript.

Octane uses native delegated DOM events, so handlers receive browser events
rather than React synthetic events. Fixed-size visualizations render their real
SVG during SSR and hydrate by adopting that DOM. Responsive components preserve
their upstream initial-size controls and begin observing only after hydration.

Browser-only upstream internals have deterministic first-render adapters. Text
and annotation measurement use stable font-metric estimates, SplitLinePath uses
a pure SVG path sampler instead of mounting a browser path, and wordclouds use
collision-aware estimated glyph rectangles instead of canvas pixel masks. The
`react-spring` entry point interpolates numeric values on animation frames
without reproducing spring-physics timing, while Zoom uses native wheel,
pointer, and touch listeners. These choices keep SSR and hydration stable;
applications that depend on exact browser font metrics, pixel-exact d3-cloud
packing, browser-specific path length rounding, or spring timing should account
for the noted behavioral difference.

The non-importable `@visx/demo` site and private `@visx/registry` tooling are not
library surfaces. Upstream's `@visx/vendor` is CJS/ESM packaging infrastructure;
this ESM-first port uses the same pinned D3 implementations directly.
