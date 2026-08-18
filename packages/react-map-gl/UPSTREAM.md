# @vis.gl/react-mapbox upstream provenance

This port targets the immutable release `@vis.gl/react-mapbox@8.1.2`:

- repository: `https://github.com/visgl/react-map-gl`;
- tag: `v8.1.2`, tag object `fb9c6230b59eb0cde25b53a2d82481d83c968866`;
- tag commit: `b1e46fcfb9d5de9bb179ca54e7d27617caa28c65`;
- source root: `modules/react-mapbox/src`; test root `modules/react-mapbox/test`;
- license: MIT, Copyright Vis.gl contributors.

`react-map-gl@8.1.2` is a re-export shell: its `./mapbox` subpath is this
package, `./maplibre` is `@vis.gl/react-maplibre`, and `./mapbox-legacy` is a
mapbox-gl v1 compatibility build. The port therefore targets the real source
package, and publishes both `.` and `./mapbox` so either import works.

The advertised peer range is `mapbox-gl >= 3.5.0`, matching upstream. The
immutable oracle is `mapbox-gl@3.9.0`, the release upstream develops against.
`mapbox-gl` is an optional peer and is never vendored: from v2 it ships under
the Mapbox Terms of Service rather than an OSS license, and it bills per map
load against an access token.

## Source boundary

Fourteen upstream modules carry no React import and are reused **byte-for-byte**
under a five-line provenance banner (`@ts-nocheck` plus the reason). Strip the
banner and the bytes equal `upstream/src/<same path>` exactly, which is what
makes an upstream bump a readable diff:

- `mapbox/mapbox.ts`, `mapbox/proxy-transform.ts`, `mapbox/create-ref.ts`;
- `types/common.ts`, `types/events.ts`, `types/internal.ts`, `types/lib.ts`,
  `types/style-spec.ts`;
- `utils/assert.ts`, `utils/compare-class-names.ts`, `utils/deep-equal.ts`,
  `utils/set-globals.ts`, `utils/style-utils.ts`, `utils/transform.ts`.

Upstream compiles without `strictNullChecks` or `noImplicitAny`; this repository
is strict. Rather than edit vendored source to satisfy a constraint its authors
never applied, those files carry `@ts-nocheck` and are typechecked at upstream's
own settings through `upstream/`. Everything the port authors is fully strict.

`upstream/tsconfig.json` is deliberately not vendored: it is vis.gl monorepo
build config, excluded from the published package by its own `files` field, and
its `extends` path does not resolve outside that repository.

Everything else is re-implemented against Octane hooks.

## Export crosswalk

Every runtime and type export of `modules/react-mapbox/src/index.ts` at the pin.

| Export | Kind | Disposition | Evidence |
| --- | --- | --- | --- |
| `Map` (also `default`) | component | ported | `tests/upstream/map.test.ts` (7 cases), `tests/ssr/ssr.test.ts`, `tests/hydration/hydration.test.ts`, differential |
| `Marker` | component | ported | `tests/upstream/marker.test.ts` (4 cases), differential |
| `Popup` | component | ported | `tests/upstream/popup.test.ts` (2 cases), `differential:1`, `differential:3` |
| `Source` | component | ported, one divergence | `tests/upstream/source-layer.test.ts` (1 case), `differential:2` |
| `Layer` | component | ported, one divergence | `tests/upstream/source-layer.test.ts` (2 cases), `differential:2` |
| `AttributionControl` | component | ported | `tests/upstream/controls.test.ts:1` |
| `FullscreenControl` | component | ported | `tests/upstream/controls.test.ts:2` |
| `GeolocateControl` | component | ported | `tests/upstream/controls.test.ts:3` |
| `NavigationControl` | component | ported | `tests/upstream/controls.test.ts:4`, `:7` |
| `ScaleControl` | component | ported | `tests/upstream/controls.test.ts:5`, `:6` |
| `useControl` | hook | ported | exercised by all five controls; `:6` pins in-place reconfiguration; `differential:5` pins the consumer-facing hook itself |
| `MapProvider` | component | ported | `tests/upstream/use-map.test.ts` (2 cases), `differential:4` |
| `useMap` | hook | ported | `tests/upstream/use-map.test.ts` (2 cases), `differential:4` |
| `MapProps` | type | ported | `typetests/*/types.test-d.ts` group 1–2 |
| `MapRef` | type | reused verbatim (`mapbox/create-ref.ts`) | `tests/upstream/map.test.ts:1` |
| `MarkerProps` | type | ported | type suites group 3–4 |
| `PopupProps` | type | ported | type suites (shape mirrors `MarkerProps`) |
| `SourceProps` | type | ported | type suites group 5 |
| `LayerProps` | type | ported | type suites group 6 |
| `AttributionControlProps` | type | ported | compiled by the adapted type suite |
| `FullscreenControlProps` | type | ported | compiled by the adapted type suite |
| `GeolocateControlProps` | type | ported | compiled by the adapted type suite |
| `NavigationControlProps` | type | ported | compiled by the adapted type suite |
| `ScaleControlProps` | type | ported | compiled by the adapted type suite |
| `export * from './types/common'` | types | reused verbatim | pristine + adapted util lanes |
| `export * from './types/events'` | types | reused verbatim | pristine + adapted util lanes |
| `export * from './types/lib'` | types | reused verbatim | pristine + adapted util lanes |
| `export * from './types/style-spec'` | types | reused verbatim | pristine + adapted util lanes |

### Open gaps

- **`reuseMaps` / `Mapbox.recycle()`** is wired through from the reused engine
  and typed, but no test exercises the recycle path. It is not covered by
  upstream's suite either. Treat it as unverified.
- **`gl` (external WebGL context)**, **`RTLTextPlugin` loading** and
  **`workerClass`/`workerUrl`** reach the reused `set-globals`/`mapbox` modules
  unchanged and have no behavioral test here. Upstream has none either.
- **`react-map-gl/mapbox-legacy`** (mapbox-gl v1) is out of scope, matching the
  current-major-only decision. Not applicable rather than missing.
- **`@vis.gl/react-maplibre`** is a separate upstream package and out of scope.

## Test disposition

Every artifact under `modules/react-mapbox/test` at the pin.

| Upstream file | Disposition |
| --- | --- |
| `test/utils/apply-react-style.spec.js` | **run byte-exact**, both lanes |
| `test/utils/compare-class-names.spec.js` | **run byte-exact**, both lanes |
| `test/utils/deep-equal.spec.js` | **run byte-exact**, both lanes |
| `test/utils/style-utils.spec.js` | **run byte-exact**, both lanes |
| `test/utils/transform.spec.js` | **run byte-exact**, both lanes |
| `test/utils/mapbox-gl-mock/*.js` (5) | vendored; `transform.js`, `lng_lat.js` and `lng_lat_bounds.js` also back the component double |
| `test/utils/test-utils.jsx` | not applicable — `waitForMapLoad`/`sleep` are replaced by explicit draining |
| `test/utils/token.js` | not applicable — no live Mapbox token in CI |
| `test/components/map.spec.jsx` | **ported** → `tests/upstream/map.test.ts`; `Map#uncontrolled` is out of scope (asserts animation monotonicity across a real raf render loop) |
| `test/components/marker.spec.jsx` | **ported** → `tests/upstream/marker.test.ts` |
| `test/components/popup.spec.jsx` | **ported** → `tests/upstream/popup.test.ts` |
| `test/components/source.spec.jsx` | **ported** → `tests/upstream/source-layer.test.ts` |
| `test/components/layer.spec.jsx` | **ported** → `tests/upstream/source-layer.test.ts` |
| `test/components/controls.spec.jsx` | **ported** → `tests/upstream/controls.test.ts` |
| `test/components/use-map.spec.jsx` | **ported** → `tests/upstream/use-map.test.ts` |
| `test/components/index.js`, `test/utils/index.js` | not applicable — ocular aggregators |

Upstream ships **no type tests** at the pin: there is no `__typetest__`
directory and no tsd/expect-type harness. Both type lanes are therefore
port-authored against one shared assertion list (`typetests/assertions.md`), one
compiled against the published upstream typings with `tsc` and one against this
package with `tsrx-tsc`. The permitted transformations between them are listed
in that file; anything else is drift.

## Port-authored test classification

Every test file this package owns, with exactly one classification and the React
evidence it is paired against. Unpaired files are **not** React-parity evidence
and are not counted as such by any lane.

| File | Classification | Pairing |
| --- | --- | --- |
| `tests/upstream-util/pristine.test.ts` | unmodified upstream | runs upstream's own specs against `upstream/src` |
| `tests/upstream-util/adapted.test.ts` | unmodified upstream | same specs, same bytes, against the reused modules |
| `tests/upstream/{map,marker,popup,source-layer,controls,use-map}.test.ts` | adapted upstream | each case cites the upstream case it re-authors |
| `tests/differential/parity.test.ts` | React/Octane differential | the published `@vis.gl/react-mapbox@8.1.2` on React |
| `tests/ssr/ssr.test.ts` | Octane-only framework contract | unpaired — upstream ships no SSR test and React's server output is not this port's contract |
| `tests/hydration/hydration.test.ts` | Octane-only framework contract | unpaired — hydration marker and adoption behavior is Octane's, not upstream's |
| `tests/runtime/lifecycle.test.ts` | Octane-only divergence | unpaired — pins teardown ordering the upstream suite cannot observe |
| `tests/runtime/smoke.test.ts` | Octane-only framework contract | unpaired — package surface and entry points |
| `tests/harness/tape-adapter.test.ts` | harness negative controls | unpaired — proves a removed, renamed or unexecuted upstream case fails validation |
| `typetests/{pristine,adapted}/types.test-d.ts` | port-authored type lanes | paired with each other through `typetests/assertions.md` |

## How the evidence is bounded

The five util specs are the only upstream tests that run unmodified, and they
run **twice**: once against `upstream/src` and once against the modules this
port reuses. Both passing is what backs the byte-for-byte reuse claim.

The seven component specs cannot run as pristine evidence. Each constructs a
real `mapbox-gl@3` Map with a live `VITE_MAPBOX_TOKEN` and waits on
`isStyleLoaded()` under puppeteer; CI can hold neither the account nor the map
loads. They are ported against `tests/_mocks/mapbox-gl.ts`, a port-authored
double — **weaker evidence than a pristine run, and recorded as such**.

What keeps the double honest is `tests/differential/parity.test.ts`: five
fixtures run through this binding and through the *published*
`@vis.gl/react-mapbox@8.1.2` on real React, sharing that same double. A double
that flattered the Octane binding would have to flatter React identically. They
cover the map shell and portalled overlay content (`differential:1`),
`<Source>`/`<Layer>` add, update and remove (`differential:2`), in-place popup
option edits alongside control add and remove (`differential:3`), and reaching
the map by id from a component outside it and flying the camera
(`differential:4`), and `useControl` called straight from a consumer module
(`differential:5`).

`<Source>` and `<Layer>` emit no DOM, so `differential:2` reads the resulting
style back off the live map through `useMap()` and renders it into the page —
the comparison is then over what each binding told mapbox-gl to do, not over
markup neither of them produces.

Not covered by any of this: real WebGL, real tile loading, real pointer
interaction, and anything that needs a Mapbox account. A token-gated real-map
lane remains open work.

## Divergences

1. **`react-map-gl-source-id-by-context`** — upstream delivers a `<Source>` id to
   child layers with `cloneElement(child, {source: id})`. Octane cannot clone a
   compiled children block, so the id travels by context. Same override
   semantics; the id now reaches any descendant `<Layer>`, not only direct
   children. `ported:source-layer:3` pins the half both models share — a layer
   inherits the generated id and an explicit `source` still loses to the
   enclosing one — with a direct child, so it cannot observe the half where they
   part. `tests/runtime/source-context.test.ts` mounts a layer below a wrapper
   component, which is the shape `cloneElement` would have missed.
2. **`react-map-gl-refs-as-props`** — `forwardRef` does not exist in Octane, so
   `Map`, `Marker`, `Popup` and `GeolocateControl` take `ref` as a plain prop.
   `<Map ref={mapRef} />` is unchanged for consumers.
3. **Teardown timing** — effect cleanups run on the passive drain after
   `root.unmount()`, not inside it, so the map's WebGL context and workers are
   released one drain later. This is an Octane runtime property rather than a
   binding behavior and no parity lane observes it, so it is deliberately not a
   manifest divergence; it is pinned by `tests/runtime/lifecycle.test.ts`.
4. **`Marker` element chosen from rendered output** — upstream asks
   `React.Children.forEach` whether it was handed a truthy child and, if so,
   gives the marker its own element to portal into. A `.tsrx` children block is
   an opaque render function, and evaluating it to look inside would re-run any
   hooks it contains against the same call-site slots, so the binding infers the
   answer from what the block rendered instead. It portals into an element it
   owns from the first render — never `marker.getElement()`, or content arriving
   late would land inside Mapbox's pin and both would draw — and rebuilds the
   marker once the answer is known, in either direction. Same result as upstream
   for a block that renders something and for one that renders nothing, and for
   content that appears after mount. It differs for a child that is truthy but
   renders nothing for the component's whole life: upstream leaves an empty
   custom element, so the marker is invisible, and the port draws the default
   pin. Pinned by `tests/runtime/marker-element.test.ts` and, against real
   React, by `differential:6`.

## Regenerating
