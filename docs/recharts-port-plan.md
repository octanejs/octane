# @octanejs/recharts — Recharts 3 port plan

Port of recharts **3.9.2** to octane, following the query/router playbook: reuse
every framework-agnostic module, re-implement only the React layer, and prove
parity with a differential rig that byte-compares SVG output against the real
recharts. Audited 2026-07-07 from the shipped `es6/` build (structure-preserving
babel output; no `exports` map, so modules are deep-inspectable).

## The seam

Recharts 3 is unusually well-factored for this port:

- **Chart state is Redux.** One RTK store per chart (`state/store.js`): 16
  slices (layout, chartData, cartesianAxis, polarAxis, graphicalItems, tooltip,
  brush, legend, options, rootProps, polarOptions, referenceElements, errorBar,
  eventSettings, renderedTicks, zIndex), 5 listener middlewares (mouse, move,
  keyboard, external, touch), reselect selectors (~60 files + 16 combiners),
  `autoBatchEnhancer({type:'raf'})`. All framework-agnostic.
- **The react-redux surface consumed is exactly two APIs**: `Provider` with a
  custom `context={RechartsReduxContext}`, and `shallowEqual` (in memo
  comparators). Components read state through recharts' OWN
  `useAppSelector` = `useSyncExternalStoreWithSelector` (the
  `use-sync-external-store/shim/with-selector` algorithm) against
  `{store, subscription}` from that context. So the octane port implements:
  a context + provider (`RechartsStoreProvider`, with the Brush "panorama"
  passthrough — a panorama chart renders NO provider and inherits the parent
  store), a with-selector `useAppSelector` on octane's native
  `useSyncExternalStore`, `useAppDispatch`, and a local `shallowEqual`.
  Nothing from the react-redux package survives.
- **~155 of 264 es6 files have no react import** and are reusable: all slices/
  middlewares/selectors/state types, `util/ChartUtils`, `util/DataUtils`,
  `util/scale/**` (getNiceTickValues, RechartsScale on decimal.js-light),
  getTicks, PolarUtils, stacks, cursor math, DOMUtils (DOM, not React),
  Events (eventemitter3 sync), Global, the animation core state machines
  (`AnimationHandle`, easing, matchBy, timeoutController), zIndex defaults +
  selectors, `Cell` (a null-rendering props carrier).
- **Vendoring, not deep imports.** The es6 files use extensionless relative
  imports (bundler-only resolution) and deep-importing recharts would drag
  react/react-dom peer deps into consumers. Pure modules are vendor-copied into
  `src/vendor/` preserving file structure (reviewable against upstream).
  Watch for "pure" files importing PURE EXPORTS from react-coupled files
  (e.g. `selectors/barSelectors` imports `computeBarRectangles` from
  `cartesian/Bar.js`) — those need the pure export extracted alongside.
  Caveats: `util/propsAreEqual` imports react-redux's shallowEqual (inline it);
  `util/createEventProxy` calls the synthetic-only `event.persist()` (patch for
  native events — never emulate synthetic events, per repo policy).

## React coupling inventory (what actually needs porting — ~109 files)

- **Class components (6, all internal):** Line/Area/Bar/RadialBar `*WithState`
  are render-only PureComponents → octane `memo` + function. `BrushWithState`
  and `TreemapWithState` carry drag state + window capture listeners → hooks.
- **forwardRef (19 files):** refs-as-props in octane; `useImperativeHandle`
  twice (CartesianAxis, ResponsiveContainer).
- **Contexts (15):** all plain-value contexts (store, panorama, tooltip/legend
  portal targets, graphical-item id, ErrorBar, brushUpdate, BarStack,
  animation controller, clipPath id, responsive container, label viewBox,
  labelList entries) — direct ports.
- **Children introspection (3 survivors):** `findAllByType(children, Cell)` at
  6 sites (Bar/Funnel/Scatter/RadialBar/Pie); `Children.count/only` in Brush;
  `ReactUtils.toArray` fragment flattening. Everything else moved to redux
  registration in v3. One octane descriptor-introspection util covers it.
- **Element-as-prop pattern (22 files):** `tick=`, `label=`, `shape=`, `dot=`,
  `content=`, `cursor=` accept element | component | boolean → one shared
  `cloneElement`-equivalent helper on octane descriptors.
- **Portals (3):** Tooltip + Legend portal into the wrapper div; **ZIndexLayer
  portals into redux-registered SVG `<g>` nodes** — this is on the DEFAULT path
  (grid −100 / bar 300 / axis 500 / labels 2000 render through SVG portals).
  octane `createPortal` must namespace children correctly inside an SVG
  container — verify with an octane runtime test first.
- **Animation:** homegrown in v3 (react-smooth is gone). Pure core +
  `JavascriptAnimate` (render-prop `children(t)`, rAF), `CSSTransitionAnimate`,
  `AnimatedItems` enter/update/exit wrapper. `isAnimationActive={false}` short-
  circuits to a single synchronous `children(1)` — Phases 0–4 ride that;
  Phase 5 ports the animated path (inject recharts' own mock
  AnimationController for deterministic differential steps).
- **Measurement:** `getStringSize` (hidden span + getBoundingClientRect, LRU,
  0×0 under SSR), `useElementOffset` (RO + rect), `useReportScale`,
  ResponsiveContainer (ResizeObserver).
- **Events:** wrapper-div handlers dispatch redux actions; RTK listener
  middlewares compute active state from `getRelativeCoordinate(e)` — reads
  `e.currentTarget` synchronously. Under octane's native delegation
  `currentTarget` may be the delegation root: pass the wrapper node explicitly
  if it diverges. Item handlers attach per-shape.
- **Render pipeline is multi-pass:** size lands via effect → axes/items
  register via layout-effects → offset selectors → final paint, plus a rAF for
  auto-batched graphical-item notifications. The differential rig must settle
  effects + one frame on BOTH sides before comparing.

## Public surface to reach

97 runtime exports + 78 type exports (v2's `generateCategoricalChart` is gone —
12 chart containers are thin wrappers over internal `CartesianChart` /
`PolarChart`). 25 hooks are thin selector reads that fall out of the redux
layer nearly free.

## Phases

- **Phase 0 — foundation.** Octane redux layer (context + provider +
  with-selector `useAppSelector` + `useAppDispatch`), `Surface`, `Layer`, the 8
  pure shapes (Rectangle, Curve, Dot, Cross, Sector, Symbols, Polygon,
  Trapezoid; static paths — entrance-dash `getTotalLength` bits are Phase 5),
  `Cell`, differential rig proving byte-equal SVG on shapes + a redux
  round-trip test. **Status: shipped 2026-07-07.**
- **Phase 1 — static BarChart + LineChart end-to-end** (`isAnimationActive
  ={false}`): vendor the state layer (store, slices, middlewares, selectors,
  scale/), port the §5 pipeline — CartesianChart/CategoricalChart/
  RechartsWrapper/RootSurface/ClipPathProvider, chartData/layout contexts +
  reporter components, XAxis/YAxis/CartesianAxis/Text/Label, Bar/Line,
  ZIndexPortal/ZIndexLayer (SVG-g portals!), static animation shims, Cell
  introspection. Exit: differential byte-equality on Bar+Line charts with axes.
  **Status: shipped 2026-07-07.** Notes: (1) `src/` now MIRRORS upstream's file
  layout — 116 pure modules vendored verbatim, react-coupled files ported at
  the same paths, so upstream relative imports resolve unchanged; `Bar.ts`/
  `Line.ts` are extensionless-resolution shims over the `.tsrx` components for
  the vendored selectors' `computeBarRectangles`/`computeLinePoints` imports.
  (2) Cell introspection became Cell REGISTRATION (context/CellsContext) —
  octane's compiled children are opaque; mount order preserves data-index
  order. (3) The animation layer is fully ported (JavascriptAnimate/
  AnimatedItems/controllers); Phase 1 exercises only the `isActive=false`
  synchronous path. (4) ZIndexLayer portals into redux-registered SVG `<g>`s
  work on octane's createPortal after the SVG-only-tag namespace inference fix
  landed in octane itself. (5) ResponsiveContainer is context-only until
  Phase 2.
- **Phase 2 — Tooltip, Legend, ResponsiveContainer** (interaction +
  measurement; native-event contact points live here).
- **Phase 3 — remaining cartesian** (Area, ComposedChart, Scatter+ZAxis,
  ErrorBar, References, CartesianGrid, BarStack, Funnel, Brush — hardest:
  drag state, capture listeners, panorama store-sharing, compact mode).
- **Phase 4 — polar** (PolarChart wrapper + Pie/Radar/RadialBar + polar axes;
  reuses the registration/selector pattern wholesale).
- **Phase 5 — animation + sync + exotics** (real JavascriptAnimate/
  CSSTransitionAnimate on octane hooks, line-draw getTotalLength paths, chart
  sync via eventemitter3, Treemap/Sankey/SunburstChart, typed chart factories).

## Testing

- `tests/differential/` — the SAME `.tsrx` fixture through @octanejs/recharts
  and real recharts (globalSetup rewrites the import specifiers), byte-equal
  `innerHTML` after settle (effects + one rAF). SVG output makes recharts the
  best possible subject for this rig.
- `tests/conformance/` — octane-side behavior tests (redux round-trips,
  registration cascades, event dispatch → tooltip state).
- Animation determinism (Phase 5): inject a mock AnimationController through
  `AnimationControllerProvider` on both sides; compare at fixed `t`.
