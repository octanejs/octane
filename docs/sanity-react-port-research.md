# Sanity React packages worth porting to Octane

Research date: 2026-08-24

## Recommendation

The best first port is **`@portabletext/react`**. It has the strongest combination of
Sanity relevance, broad adoption, a tiny renderer-specific layer, SSR compatibility,
and almost no browser coupling. After that, port **`@sanity/icons`** (with
`@sanity/logos` as a small companion), then choose between **`react-rx`** and
**`@sanity/react-loader`** depending on whether the goal is general ecosystem coverage
or a complete Sanity content workflow.

Recommended order:

1. `@portabletext/react` → `@octanejs/portabletext`
2. `@sanity/icons` → `@octanejs/sanity-icons`; optionally add `@sanity/logos`
3. `react-rx` → `@octanejs/rx`
4. `@sanity/react-loader` → `@octanejs/sanity-loader`
5. `@sanity/sdk-react` → a larger `@octanejs/sanity` project
6. `@sanity/ui` → a phased design-system project, not a single small port

Do **not** start with `@portabletext/editor`, the complete
`@sanity/visual-editing` React implementation, Sanity Studio, or Studio plugins.
`@sanity/preview-kit` should not be ported because Sanity says it is no longer
actively developed and directs React Router/Remix/TanStack Start users to React
Loader instead ([official package page](https://www.npmjs.com/package/%40sanity%2Fpreview-kit)).

## How the candidates were judged

“Perfect for porting” means more than “uses React.” The strongest candidate:

- has a useful, stable public API that Octane users would otherwise lack;
- keeps domain logic in framework-neutral packages and uses React only as a thin
  rendering or subscription adapter;
- avoids React DOM internals, synthetic events, class components, and deep
  contenteditable behavior;
- has source and tests that can support differential parity checks;
- is actively shipped and meaningfully used.

Weekly download counts below are npm registry totals for 2026-08-17 through
2026-08-23. They are a rough adoption/maintenance signal, not a count of independent
applications: several Sanity packages depend on one another.

## Ranked candidates

### 1. `@portabletext/react`: near-ideal

**Why it fits.** The checked-in package is `8.0.1`, has only two runtime
dependencies (`@portabletext/toolkit` and `@portabletext/types`), and declares only
React as a peer. Its source has nine implementation files; the core component turns
framework-neutral Portable Text trees into elements and does not touch `window`,
`document`, layout, or browser events
([manifest](https://github.com/portabletext/react-portabletext/blob/main/package.json),
[renderer source](https://github.com/portabletext/react-portabletext/blob/main/src/react-portable-text.tsx)).
The repository explicitly supports both normal client/SSR rendering and React Server
Components through export conditions
([README](https://github.com/portabletext/react-portabletext#react-server-components)).

**Adoption and maturity.** It recorded **1,306,712 downloads** in the measured week
([npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40portabletext%2Freact)).
The repository has a substantial test/fixture surface around a very small runtime,
including normal rendering, type generation, and a Next test application
([repository](https://github.com/portabletext/react-portabletext)).

**API worth preserving.** Preserve `PortableText`, `defaultComponents`,
`mergeComponents`, `toPlainText`, `ListNestMode`, `PortableTextBlock`, component maps
for block styles, types, marks, lists and list items, missing-component handling, and
the current generic TypeGen-aware component types
([public exports](https://github.com/portabletext/react-portabletext/blob/main/src/index.ts),
[public types](https://github.com/portabletext/react-portabletext/blob/main/src/types.ts)).

**Port shape.** Keep the toolkit and types packages unchanged. Replace React element
and component types with Octane equivalents, translate the five `.tsx` rendering
files to `.tsrx`, and preserve server output exactly. The differential oracle is
excellent: render the same Portable Text values and custom component maps with React
and Octane, then compare normalized HTML, warning calls, and renderer props. There is
no need to reimplement Portable Text parsing or list/mark construction.

**Risk.** Low. The largest compatibility question is type naming: upstream exposes
some `React`-branded public type names. The Octane package should keep aliases for
source migration while documenting renderer-neutral preferred names.

### 2. `@sanity/icons` and `@sanity/logos`: ideal generated ports

**Why they fit.** `@sanity/icons@5.2.1` is side-effect-free, declares React as its only
peer, and publishes **236 per-icon subpaths** in addition to its root export
([manifest](https://github.com/sanity-io/ui/blob/main/packages/icons/package.json)).
Individual exports are tiny SVG components with normal SVG props and a ref, with no
browser globals or effects
([representative icon](https://github.com/sanity-io/ui/blob/main/packages/icons/src/exports/Rocket.tsx)).
`@sanity/logos@2.2.5` is the same basic shape for four brand marks and adds only
`@sanity/color` as a runtime dependency
([manifest](https://github.com/sanity-io/ui/blob/main/packages/logos/package.json),
[representative logo](https://github.com/sanity-io/ui/blob/main/packages/logos/src/sanityLogo.tsx)).

**Adoption and maturity.** The measured week had **1,333,402 downloads** for icons
and **735,150** for logos
([icons downloads](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Ficons),
[logos downloads](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Flogos)).
The package is generated, publishes tree-shakable per-icon entry points, and is part
of Sanity's actively maintained UI monorepo
([repository](https://github.com/sanity-io/ui/tree/main/packages/icons)).

**API worth preserving.** Preserve every named icon component, default and named
per-icon subpath exports, SVG props, `currentColor`, sizing, arbitrary attributes,
and ref behavior. Keep logos separate if matching upstream package boundaries is more
valuable than minimizing package count.

**Port shape.** Follow the same architecture already used by Octane's Lucide port:
generate small Octane wrappers from upstream-owned icon geometry, map React
`forwardRef` to Octane's normal `ref` prop, verify the generated export map, and run
differential SVG DOM tests. Octane already has a proven generated-icon package
structure in [`@octanejs/lucide`](https://github.com/octanejs/octane/tree/main/packages/lucide).

**Risk.** Very low. The only strategic caveat is that Lucide already covers general
icons; the value here is Sanity UI and Sanity application compatibility, not another
general icon set.

### 3. `react-rx`: excellent framework-adapter port

**Why it fits.** Sanity's `react-rx@6.0.0` is explicitly a hook layer over RxJS. Its
public entry point exports `useObservable`, `useSyncObservable`,
`useObservableEvent`, and `useObservablePromise`; its only direct runtime dependency
is `use-effect-event`, with React and RxJS as peers
([manifest](https://github.com/sanity-io/react-rx/blob/current/packages/react-rx/package.json),
[exports](https://github.com/sanity-io/react-rx/blob/current/packages/react-rx/src/index.ts)).
The implementation uses hooks and RxJS subscriptions but no DOM APIs
([`useObservable`](https://github.com/sanity-io/react-rx/blob/current/packages/react-rx/src/useObservable.ts),
[`useObservableEvent`](https://github.com/sanity-io/react-rx/blob/current/packages/react-rx/src/useObservableEvent.ts)).

**Adoption and maturity.** It recorded **819,336 downloads** in the measured week
([npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/react-rx)).
The current package source is compact and has more test files than non-test source
files, covering subscription, SSR, Strict Mode, observable identity, Suspense, and
deferred update behavior
([source tree](https://github.com/sanity-io/react-rx/tree/current/packages/react-rx/src)).

**API worth preserving.** Preserve the four public hooks, overload behavior for
initial values, the `disabled` option, synchronous-emission behavior, observable
promise caching, and the distinction between deferred `useObservable` and urgent
`useSyncObservable`.

**Port shape.** Reuse RxJS unchanged. Translate the adapter to Octane hooks and give
every hand-authored hook call an explicit stable slot. Differential tests must cover
subscription timing and SSR, not just returned values.

**Risk.** Low-to-medium. There is no DOM work, but the package deliberately relies on
subtle `useSyncExternalStore`, `useDeferredValue`, transition, warm-up, and server
snapshot semantics. This is an excellent test of Octane's React-shaped concurrency
contract, but it should not be treated as a mechanical import rename.

### 4. `@sanity/react-loader`: best Sanity-specific data port

**Why it fits.** `@sanity/react-loader@2.2.1` keeps querying, live-mode, and source-map
logic in framework-neutral `@sanity/core-loader`; its React layer mainly supplies
`useQuery`, `useLiveMode`, `useEncodeDataAttribute`, query-store factories, and
server/client entry points
([manifest](https://github.com/sanity-io/visual-editing/blob/main/packages/react-loader/package.json),
[README](https://github.com/sanity-io/visual-editing/tree/main/packages/react-loader#readme)).
The representative query hook is normal state/effect/memo/external-store glue around
the core loader and has no renderer-specific DOM manipulation
([`defineUseQuery`](https://github.com/sanity-io/visual-editing/blob/main/packages/react-loader/src/defineUseQuery.ts)).

**Adoption and maturity.** It recorded **58,313 downloads** in the measured week
([npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Freact-loader)).
Sanity's Visual Editing repository identifies React Loader as the React framework
loader built on `@sanity/core-loader`
([repository README](https://github.com/sanity-io/visual-editing#loaders)).

**API worth preserving.** Preserve `createQueryStore`, `loadQuery`, `setServerClient`,
`useQuery`, `useLiveMode`, `useEncodeDataAttribute`, the returned
`encodeDataAttribute`, and the server/browser split. The optional `./jsx` wrapper and
`./rsc` export need explicit scope decisions
([export map](https://github.com/sanity-io/visual-editing/blob/main/packages/react-loader/package.json)).

**Port shape.** Reuse `@sanity/client`, `@sanity/core-loader`, and
`@sanity/visual-editing-csm`. Port the hooks and define Octane-specific server/browser
conditions rather than copying React Server Component assumptions. The JSX data
wrapper can be a second milestone after querying and live mode.

**Risk.** Medium. The hook code is small, but live editing crosses SSR, hydration,
browser connection, source-map, and perspective boundaries. Upstream has only a
small focused test surface in this package, so the Octane port needs integration
fixtures with a real query-store lifecycle.

### 5. `@sanity/sdk-react`: strategically strong, not a small first port

**Why it fits eventually.** `@sanity/sdk-react@2.20.1` is a React adapter over the
framework-neutral `@sanity/sdk`, which owns clients, stores, resource state, document
operations, queries, and subscriptions. The React package re-exports the core and
adds providers, application setup, and hooks
([React manifest](https://github.com/sanity-io/sdk/blob/main/packages/react/package.json),
[core manifest](https://github.com/sanity-io/sdk/blob/main/packages/core/package.json),
[public exports](https://github.com/sanity-io/sdk/blob/main/packages/react/src/_exports/sdk-react.ts)).
This is exactly the architectural boundary an Octane integration wants.

**Adoption and maturity.** It recorded **61,405 downloads** in the measured week
([npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Fsdk-react)).
The package is actively developed and exposes real-time queries, optimistic document
editing, presence, comments, authentication, releases, projects, organizations, and
dashboard integration
([official repository](https://github.com/sanity-io/sdk),
[public exports](https://github.com/sanity-io/sdk/blob/main/packages/react/src/_exports/sdk-react.ts)).

**API worth preserving.** A parity target would include `SanityApp`, `SDKProvider`,
resource/instance providers, authentication hooks, `useQuery`, document CRUD and
editing hooks, presence, comments, releases, organization/project hooks, and window
connection helpers.

**Port shape.** Reuse `@sanity/sdk` unchanged and rebuild only the provider/hook layer.
A representative query hook maps cleanly to Octane's Suspense, transitions,
external-store subscriptions, and normal hooks
([`useQuery`](https://github.com/sanity-io/sdk/blob/main/packages/react/src/hooks/query/useQuery.ts)).

**Risk.** Medium-to-high because of scope, not architectural mismatch. The React
layer currently contains roughly 168 source files including about 72 tests, and it
spans authentication, cross-window messaging, abortable Suspense queries, optimistic
updates, and application bootstrapping
([GitHub source tree](https://api.github.com/repos/sanity-io/sdk/git/trees/main?recursive=1)).
Treat it as its own roadmap after React Loader proves the basic Sanity data path.

### 6. `@sanity/ui`: valuable phased port, not “perfect” as one unit

**Why it is attractive.** `@sanity/ui@4.0.6` is Sanity's design system and recorded
**1,424,688 downloads** in the measured week
([manifest](https://github.com/sanity-io/ui/blob/main/packages/ui/package.json),
[npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Fui)).
Its v4 API already separates heavy components into subpaths, leaving a useful root
surface of theme APIs, layout and typography primitives, inputs, Dialog, tabs, tree,
Portal, Layer, and hooks
([root exports](https://github.com/sanity-io/ui/blob/main/packages/ui/src/exports/index.ts)).

**Why it is not an early port.** The package has roughly 355 source files and about
48 tests. It uses focus management, global keyboard and outside-click listeners,
resize/media observers, portals, layers, virtual lists, and controlled form elements.
Its heavier subpaths add `@floating-ui/react-dom`, Motion's React integration, and
`react-refractor`; the package also peers on `styled-components`
([manifest](https://github.com/sanity-io/ui/blob/main/packages/ui/package.json),
[root exports and subpath rationale](https://github.com/sanity-io/ui/blob/main/packages/ui/src/exports/index.ts),
[GitHub source tree](https://api.github.com/repos/sanity-io/ui/git/trees/main?recursive=1)).

**Port shape.** Phase it:

1. theme utilities and non-interactive layout/typography primitives;
2. basic inputs, buttons, cards, badges, skeletons, and tabs;
3. Portal/Layer/Dialog and focus management;
4. floating and animated subpaths (`popover`, `tooltip`, `menu`, `autocomplete`);
5. code highlighting and virtualized components.

Octane already ships counterparts for three important dependencies:
[`@octanejs/styled-components`](https://github.com/octanejs/octane/tree/main/packages/styled-components),
[`@octanejs/motion`](https://github.com/octanejs/octane/tree/main/packages/motion), and
[`@octanejs/floating-ui`](https://github.com/octanejs/octane/tree/main/packages/floating-ui).
That reduces dependency risk, but it does not remove the behavioral work around
native events, refs, focus, layout, and accessibility.

## Packages to adapt or reuse instead of porting wholesale

### `@sanity/visual-editing`

The package is popular (**680,466 downloads** in the measured week), but its complete
implementation combines React UI overlays, Sanity UI, Motion, Floating UI, DOM scans,
custom elements, cross-frame communication, router integrations, and optimistic
editing
([manifest](https://github.com/sanity-io/visual-editing/blob/main/packages/visual-editing/package.json),
[React exports](https://github.com/sanity-io/visual-editing/blob/main/packages/visual-editing/src/react/index.ts),
[official overlay architecture](https://www.sanity.io/docs/visual-editing/visual-editing-overlays),
[npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40sanity%2Fvisual-editing)).
Sanity already publishes `@sanity/visual-editing-standalone` as a self-contained ESM
build for non-React applications
([standalone manifest](https://github.com/sanity-io/visual-editing/blob/main/packages/visual-editing-standalone/package.json),
[repository guidance](https://github.com/sanity-io/visual-editing#overlays--router-integration)).

Use the standalone controller unchanged first. If Octane-native ergonomics are
needed, build a small lifecycle/router adapter and port only the React hooks such as
`useDocuments`, `useOptimistic`, and `usePresentationQuery`. Replacing the overlay
renderer itself only makes sense if removing the standalone build's inlined React
payload is a measured priority.

### `@portabletext/editor` and `@portabletext/toolbar`

The editor is mature and heavily used (**811,335 downloads** in the measured week),
but it is the opposite of a thin renderer binding. The checked-in package has roughly
548 source files, depends on `@xstate/react`, manages a contenteditable editor, and
ships an extensive browser/E2E behavioral surface
([manifest](https://github.com/portabletext/editor/blob/main/packages/editor/package.json),
[official README](https://github.com/portabletext/editor/tree/main/packages/editor),
[npm downloads API](https://api.npmjs.org/downloads/point/2026-08-17:2026-08-23/%40portabletext%2Feditor)).
The toolbar is coupled to that editor and also depends on `@xstate/react`
([toolbar manifest](https://github.com/portabletext/editor/blob/main/packages/toolbar/package.json)).

Only consider these after the renderer, Sanity data layer, UI primitives, and an
XState binding are all proven. A framework-neutral editor core plus a new Octane view
adapter would be preferable to line-by-line porting.

### Sanity Studio and Studio plugins

The `sanity` package is a full React application and customization framework built
around React, `@sanity/ui`, styled-components, RxJS, Portable Text, and extensive
browser behavior
([architecture](https://github.com/sanity-io/sanity/blob/main/ARCHITECTURE.md),
[package](https://github.com/sanity-io/sanity/tree/main/packages/sanity)). Studio
plugins also peer on `sanity`, React, React DOM, and often styled-components
([official plugins repository guidance](https://github.com/sanity-io/plugins/blob/main/AGENTS.md#dependencies)).
They are downstream consumers of the foundational ports above, not good foundational
ports themselves.

## Suggested portfolio

For the best return with bounded risk, ship three independent milestones:

1. **Content rendering:** `@octanejs/portabletext`, with React/Octane differential
   HTML and type-surface tests.
2. **Sanity-compatible presentation:** generated `@octanejs/sanity-icons` plus the
   optional logo companion.
3. **Live content:** `@octanejs/sanity-loader`, reusing the official client,
   core-loader, and visual-editing source-map packages.

`@octanejs/rx` is the best fourth port if the goal is to strengthen Octane's general
integration catalog. `@sanity/sdk-react` and `@sanity/ui` should each get a dedicated
plan rather than being bundled into the first Sanity initiative.
