# @octanejs/react-map-gl — Mapbox binding port plan

Port of the React Mapbox binding to Octane, following the three/hook-form
playbook: peer the imperative engine, reuse every framework-agnostic module
verbatim, re-implement only the React layer, and pin the result against the
upstream release's own suite. Audited 2026-08-06 from the tagged repository.

## What is actually being ported

There is no React binding inside `mapbox-gl` — it is vanilla JS. The React
binding is `react-map-gl`, and at v8 that package is a re-export shell:

| `react-map-gl@8.1.2` subpath | resolves to |
| --- | --- |
| `./mapbox` | `@vis.gl/react-mapbox@8.1.2` |
| `./maplibre` | `@vis.gl/react-maplibre@8.1.2` |
| `./mapbox-legacy` | mapbox-gl v1 compatibility build |

So the port target is **`@vis.gl/react-mapbox@8.1.2`**:

- repository: `https://github.com/visgl/react-map-gl`;
- tag: `v8.1.2`, tag object `fb9c6230b59eb0cde25b53a2d82481d83c968866`,
  commit `b1e46fcfb9d5de9bb179ca54e7d27617caa28c65`;
- license: MIT (vendorable);
- source root: `modules/react-mapbox/src`, test root `modules/react-mapbox/test`;
- upstream peers: `mapbox-gl >=3.5.0` (optional), `react >=16.3.0`.

`mapbox-gl` itself is **never vendored and never a dependency**. From v2 onward it
ships under the Mapbox Terms of Service, not an OSS license, and it bills per map
load against an access token. It stays an optional peer dependency, exactly as
`three` is for `@octanejs/three`.

## The seam

Upstream is 28 source modules and the split strongly favors this port.

**Reused verbatim — no React import anywhere (15 modules):**

- `src/mapbox/mapbox.ts` (709 lines) — the entire engine: prop diffing, camera
  reconciliation, style diffing, the event-callback table, `reuse`/`recycle`.
- `src/mapbox/proxy-transform.ts`, `src/mapbox/create-ref.ts` — the transform
  proxy and the `MapRef` facade that hides the 25 `skipMethods` which would
  otherwise desynchronize the binding.
- `src/utils/`: `apply-react-style` (DOM style writer, React-named only),
  `assert`, `compare-class-names`, `deep-equal`, `set-globals`, `style-utils`,
  `transform`.
- `src/types/`: `common`, `events`, `internal`, `lib`, `style-spec`.

That is the majority of the package by line count, and it is the part that
encodes Mapbox behavior. Two adjustments only: `types/common` and the component
prop types reference `React.CSSProperties` / `React.ReactNode`, which become
Octane equivalents (`OctaneNode`, never `React.ReactNode`), and
`use-isomorphic-layout-effect.ts` is the one util that imports React.

**Re-implemented against Octane hooks (13 modules):**

`components/map.tsx`, `marker.ts`, `popup.ts`, `source.ts`, `layer.ts`,
`use-control.ts`, `use-map.tsx`, plus the five controls
(`attribution-control`, `fullscreen-control`, `geolocate-control`,
`navigation-control`, `scale-control`) and
`utils/use-isomorphic-layout-effect.ts`.

The five controls are near-identical thin wrappers over `useControl` plus an
`applyReactStyle` effect, so the substantive work is seven modules.

## React coupling inventory

| Upstream construct | Sites | Octane conversion |
| --- | --- | --- |
| `forwardRef` | `Map`, `Marker`, `Popup`, `GeolocateControl` | refs-as-props; `ref` is an ordinary prop |
| `memo` | all five controls, `Marker`, `Popup` | `memo` ports directly |
| `useImperativeHandle` | `Map`, `Marker`, `Popup`, `GeolocateControl` | ports directly |
| `createPortal` from `react-dom` | `Marker`, `Popup` | Octane `createPortal` into the Mapbox-owned container element |
| `React.Children.forEach` | `Marker` | **see below** |
| `React.Children.map` + `cloneElement` | `Source` | **see below** |
| `createContext` / `useContext` | `MapContext`, `MountedMapsContext` | port directly |
| `useIsomorphicLayoutEffect` | `Map` | Octane `useLayoutEffect`/`useEffect` split on `typeof document` |
| render-body imperative writes | `Marker`, `Popup`, `Source`, `Layer` | legal in Octane; ordering vs. layout effects must be pinned by a conformance test, not assumed |
| explicit `[]` dependency arrays | `useControl`, `Marker`, `Popup`, `Map` | keep them explicit — Octane never rewrites an explicit array, so upstream timing is preserved exactly |
| StrictMode `_setupUI` double-mount guard | `GeolocateControl` | retain the guard verbatim; Octane has no StrictMode double-invoke, so it is inert here. Record as a divergence note, do not delete upstream code |
| dynamic `import('mapbox-gl')` inside an effect | `Map` | keeps the engine off the server path; this is also the SSR boundary |

No class components, no synthetic events, no `onChange` on a text host, no React
internals reach-through. The `Map` container is a plain `<div>`; children render
into a nested `<div mapboxgl-children="">`.

## The hard part: two children-introspection sites

Octane's compiler lowers a `.tsrx` parent's element children to a **children-block
render function** tagged with `Symbol.for('octane.childrenBlock')`
(`packages/octane/src/runtime.ts:6319-6358`), not to a descriptor array. Octane
ships `Children`, `cloneElement`, and `isValidElement`, but they operate on
descriptors. Both upstream sites need a different mechanism.

**1. `Marker` / `Popup` — "are there any children?"**

```ts
let hasChildren = false;
React.Children.forEach(props.children, el => { if (el) hasChildren = true; });
const options = {...props, element: hasChildren ? document.createElement('div') : null};
```

The answer decides whether Mapbox renders its default pin or the binding portals
custom content into an owned `<div>`. The Octane form tests
`isChildrenBlock(props.children)` first and falls back to `Children.count` for a
descriptor-valued children prop coming from a `.tsx` parent. Both dialects must
work, so this needs a test on each side.

**2. `Source` — prop injection into children**

```ts
React.Children.map(props.children, child => child && cloneElement(child, {source: id}))
```

`Source` mints an id, then clones each child `<Layer>` to inject `source={id}`.
Cloning a children block is not possible. The Octane form provides the id through
a `SourceContext` that `Layer` reads when its own `source` prop is absent. That
is a real API divergence in one narrow respect: upstream injects into *direct*
children only, while a context reaches any descendant. The port must reject or
document nesting that upstream would not have supported, pin the behavior with a
test, and record it in `UPSTREAM.md` and `status.json`.

These two sites are the reason phase 0 exists. If either cannot be made to behave,
the shape of the whole binding changes.

## Test oracle: the token problem

Upstream ships a real suite — 11 spec files run by `tape-promise` under
`ocular-test` (`@vis.gl/dev-tools`), in Node and in a puppeteer browser. The
split is not favorable:

| Upstream file | Needs | Disposition |
| --- | --- | --- |
| `test/utils/deep-equal.spec.js` | nothing | run unmodified against the reused core |
| `test/utils/style-utils.spec.js` | nothing | run unmodified |
| `test/utils/apply-react-style.spec.js` | DOM | run unmodified |
| `test/utils/compare-class-names.spec.js` | nothing | run unmodified |
| `test/utils/transform.spec.js` | vendored `mapbox-gl-mock/` | run unmodified |
| `test/components/map.spec.jsx` (7 cases) | real `mapbox-gl@3`, real token, WebGL | port to `.tsrx`; token-gated |
| `test/components/marker.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/components/popup.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/components/source.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/components/layer.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/components/controls.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/components/use-map.spec.jsx` | same | port to `.tsrx`; token-gated |
| `test/utils/mapbox-gl-mock/*` (5 files) | — | vendor as fixtures |

The vendored `mapbox-gl-mock/` covers `Transform`, `LngLat`, `LngLatBounds`,
`EdgeInsets` and `util` — **it is used only by `transform.spec.js`**. Every
component spec constructs a real `Map` with `mapLib={import('mapbox-gl-v3')}` and
`mapboxAccessToken={MapboxAccessToken}` read from `VITE_MAPBOX_TOKEN`, then waits
on `isStyleLoaded()`. CI cannot depend on a Mapbox account or on network map
loads.

The consequences, which have to be settled before phase 4:

1. **A tape lane runner is new infrastructure.** Existing parity lane kinds are
   `jest-full`, `vitest-full`, and `typescript`. The pristine-upstream lane needs
   `scripts/react-parity/tape-full-runner.mjs`. This is the single largest new
   piece of harness work.
2. **The pristine lane covers the 5 util specs honestly and stops there.** The 7
   component specs cannot run pristine in CI. That is an environment gap and must
   be written as one — not silently dropped, and not counted as parity evidence.
3. **The component-behavior oracle has to be built, not inherited.** Extend the
   vendored mock into a `Map`-capable double (style load, `addSource`,
   `addLayer`, `getStyle`, `on/off`, marker/popup/control constructors) so the
   ported cases assert the same observable behavior without WebGL or a token.
   The mock is then port-authored evidence and must be classified as such: the
   same fixture runs against React and Octane in a differential lane so the mock
   cannot drift into proving only what the port already does.
4. **Token-gated real-map lanes are optional and skip cleanly** when
   `VITE_MAPBOX_TOKEN` is unset, so a maintainer with a token can reproduce the
   upstream claim locally and CI stays green without one.

Beyond upstream, the standard rig applies: Octane-only conformance for effect
order, map-instance lifetime, `reuseMaps` recycling and `MapProvider`
registration; SSR/hydration for the container-only server output; type suites
(pristine + adapted, hashed inventories); and the mutation negative controls
`react-parity:check` requires.

## Package shape

```
packages/react-map-gl/
  package.json          @octanejs/react-map-gl, exports "." and "./mapbox"
  UPSTREAM.md           pin, source boundary, export crosswalk, test disposition
  status.json           surface + divergences, matching the crosswalk
  LICENSE               MIT, vis.gl copyright retained
  README.md             compatibility status, token setup, differences
  upstream/             byte-exact modules/react-mapbox at the pin (unpublished)
  src/                  mirrors upstream layout module for module
  tests/                _fixtures/*.tsrx, upstream/, differential/, ssr/,
                        hydration/, runtime/, harness/
  typetests/
  audit/react-parity.json + inventories
```

Repository integration: Vitest projects in `vitest.config.js` carrying
`testExecution.group: 'react-parity'`; catalog entries in `pnpm-workspace.yaml`;
a `patch` changeset; then `pnpm sync` to regenerate `docs/packages.md`,
`docs/bindings-status.md`, `docs/binding-parity-gaps.md`, and the CLI/MCP
`react-map-gl → @octanejs/react-map-gl` mapping. **No `ci.yml` edit** — the
parity job discovers manifests. No `declare module '*.tsrx'` anywhere in `src/`.

## Phases

All six phases are complete. The table records what each actually produced.

| # | Phase | Outcome |
| --- | --- | --- |
| 0 | Feasibility spike | Done — see below. All three risky mechanisms cleared. |
| 1 | Pin and vendor | 53 upstream files vendored byte-exact at `b1e46fcf`; `UPSTREAM.md` carries the pin, source boundary, full export crosswalk and per-file test disposition. |
| 2 | Core reuse | 14 modules reused byte-for-byte under a 5-line banner; upstream's 5 util specs run unmodified against **both** upstream's source and the reused copies. |
| 3 | Binding | All 13 runtime exports plus every published type. |
| 4 | Component oracle | `tests/_mocks/mapbox-gl.ts` built on upstream's own vendored mock; all 7 component specs ported with per-case citations. |
| 5 | Beyond upstream | Differential lane against the published upstream binding on React (map shell, `<Source>`/`<Layer>` updates, popup options and controls), SSR, `hydrateRoot` adoption, lifecycle conformance, two type suites, tape-adapter negative controls, parity manifest with generated inventories. |
| 6 | Close out | `status.json`, README, LICENSE, changeset, `pnpm sync`, registration in the CLI/MCP/website catalogues. |

Four things went differently from the plan, all for the better:

- **No standalone tape runner.** Upstream's specs run under Vitest through a
  ~60-line assertion adapter, so the spec files stay byte-exact and only the
  harness is ours. Its negative controls are in `tests/harness/`.
- **The pristine util lane runs twice, not once.** Running the same byte-exact
  specs against `upstream/src` *and* `src/` is what actually proves the reuse
  claim; the pristine lane alone would only prove upstream still works.
- **The React oracle is the published package**, resolved from `node_modules`,
  not the vendored tree — which also keeps the Octane compiler away from it.
- **Type lanes had to be authored.** Upstream ships no type tests, and
  `react-parity:check` requires both sides, so `typetests/assertions.md` defines
  one assertion list compiled against upstream's typings with `tsc` and against
  this package with `tsrx-tsc`.

## Phase 0 result

The spike ran against a throwaway `mapbox-gl` double and cleared every risky
mechanism. Its scratch file (`tests/feasibility/mechanisms.test.ts`) was removed
once the real suite subsumed it — each finding below now has a permanent home,
cited inline, so nothing rests on a deleted probe:

- **Marker children detection works in both dialects.** `isChildrenBlock` sees a
  `.tsrx` children block, `Children.forEach` sees `.tsx` descriptors, and a
  childless marker still gets Mapbox's default pin. `createPortal` accepts a
  children block directly as its body, so custom pin content lands inside the
  marker-owned element. → `ported:marker:3`, `ported:marker:4`.
- **`SourceContext` delivers the generated id**, and the enclosing source wins
  over an explicit `source` prop, as `cloneElement` did. →
  `ported:source-layer:3`, and `differential:2` for the direct-child shape.
- **`Map` withholds its children subtree** until the promised map library
  resolves inside an effect, then renders them under the context provider. →
  `differential:1`, `tests/ssr/ssr.test.ts`.

Both mechanisms are gated by negative controls that were run and confirmed to
fail: deleting the `isChildrenBlock` branch (a naive React port) breaks the
`.tsrx` marker case, and dropping the context read in `Layer` breaks source
inheritance — the latter still reproduces today against `differential:2`.

One finding to carry into the binding: **effect cleanups run on the passive
drain, not synchronously inside `root.unmount()`.** The map instance, its
sources and its layers survive until the queue drains, so tests must
`act(() => unmount())` and the README has to be explicit that `map.remove()` is
not synchronous with unmounting. For a library holding WebGL contexts and web
workers this is consumer-visible, and it needs its own behavioral test in
phase 5.

The probes are scaffolding, not the binding. Phase 3 rewrites them against the
vendored source; the double is replaced by the phase-4 oracle.

## Settled decisions

1. **Package name: `@octanejs/react-map-gl`**, with a `./mapbox` subpath. It
   mirrors what users actually import and leaves room for `./maplibre`.
   *(Considered and rejected: `@octanejs/react-mapbox`, which mirrors the real
   upstream source package but not the import consumers write.)*
2. **Mapbox is the target engine; MapLibre is deferred.** `@vis.gl/react-maplibre`
   is 57 near-identical files over a BSD-licensed, token-free engine, and doing
   it first would have made CI and the demo story easier — but Mapbox is what was
   asked for, and the phase-4 test double removes the token dependency anyway.
   A later `./maplibre` subpath reuses everything but the engine types.
3. **`mapbox-legacy` (mapbox-gl v1) is out of scope**, matching react-window's
   current-major-only call. It gets an explicit not-applicable crosswalk row,
   not silence.

## Final state

67 tests across five Vitest projects, all passing:

| Project | Tests | What it proves |
| --- | --- | --- |
| `react-map-gl-upstream-pristine` | 7 | upstream's util specs against upstream's own source |
| `react-map-gl-upstream-adapted` | 7 | the same byte-exact specs against the reused modules |
| `react-map-gl` | 46 | the 7 ported component specs, hydration adoption, lifecycle conformance, adapter controls |
| `react-map-gl-differential` | 5 | five fixtures through Octane and published upstream on React |
| `react-map-gl-ssr` | 2 | container-only server output |

`pnpm react-parity:check` executes all seven declared lanes. Repo-wide
`pnpm typecheck`, `pnpm format:check` and `pnpm test` (16,439 tests) pass.

## Risks

- **The component oracle is port-authored.** Upstream's own component coverage is
  unreachable in CI, so the strongest available evidence for `Map`, `Marker`,
  `Popup`, `Source`, `Layer` and the controls is a differential lane over a mock
  the port wrote. That is weaker than a pristine upstream run and must be
  disclosed as such in `UPSTREAM.md`.
- **`Source` prop injection** is the one place where the Octane API cannot match
  upstream mechanically. The context mechanism works (phase 0), but it reaches
  descendants where upstream reached only direct children; that stays a
  documented divergence.
- **Teardown is not synchronous with `unmount()`** (phase 0). Anything holding a
  WebGL context or worker pool is released on the passive drain instead.
- **Render-body imperative writes** interleaved with layout effects are the most
  likely place for a genuine ordering difference to surface.
- **jsdom fidelity** — Mapbox touches `ResizeObserver`, `matchMedia`, workers and
  canvas. Expect environment artifacts that look like Octane bugs; triage before
  they count against parity.
- **Tape runner scope creep.** It exists to execute one upstream suite. It should
  not grow into a general framework.
