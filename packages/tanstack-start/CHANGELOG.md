# @octanejs/tanstack-start

## 0.1.3

### Patch Changes

- 7bd055d: Preserve opaque virtual module identities throughout TanStack Start compilation, harden server-only `ClientOnly` stripping, derive route HMR mode from the active bundler, and inline server checks so bundlers can analyze them directly.
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [8e01289]
- Updated dependencies [7bd055d]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [1145d98]
- Updated dependencies [07dff41]
- Updated dependencies [cc79ac5]
- Updated dependencies [3686e54]
  - octane@0.1.14
  - @octanejs/tanstack-router@0.1.13

## 0.1.2

### Patch Changes

- 3ffce4c: Update the TSRX compiler adapters and Ripple integration to their synchronized
  latest releases, including the nested-JSX slash parsing fix and Solid 2 beta.15
  alignment. Refresh the supported dependency ranges shipped by the affected
  framework bindings and build integrations.
- 5974429: Fixes surfaced by porting tanstack.com to Octane (Phase 2c of the tanstack-com benchmark):

  - **octane compiler**: multi-line JSX string attributes no longer emit invalid JS (hostValue/spread, createElement de-opt, and SSR warm-child paths all re-derive the literal from its cooked value); TS `this` parameters are fully erased instead of surviving as parameter names; warm-child plans quote non-identifier prop keys (`aria-*`, `data-*`); direct calls to octane's `lazy` are emitted with `/* @__PURE__ */` so unused lazy declarations tree-shake like `React.lazy`; the vite plugin adds `.tsrx` to `resolve.extensions` so extensionless imports resolve like `.tsx`.
  - **@octanejs/tanstack-start**: new partial-hydration surface (`Hydrate` + `visible`/`idle`/`load`/`never`/`media`/`condition`/`interaction` via `./hydration`); `<ClientOnly>` children are now stripped from server compiles (octane analogue of the start-compiler's `handleClientOnlyJSX`), letting import-protection's tree-shake verification pass for `*.client.*` modules; import-protection's transform filter now covers `.tsrx` importers.
  - **@octanejs/tanstack-router**: the route-generator masker passes plain `.ts`/`.tsx` route files through untouched instead of feeding them to the TSRX parser.
  - **@octanejs/zustand**: `UseBoundStore` type is exported (upstream parity).
  - **@octanejs/sonner**: type-only names are re-exported with `export type` so compiled consumers don't reference erased bindings.

- Updated dependencies [a719b93]
- Updated dependencies [19c3ff1]
- Updated dependencies [6cecb47]
- Updated dependencies [d6ee673]
- Updated dependencies [9b6cd79]
- Updated dependencies [40d562b]
- Updated dependencies [3ffce4c]
- Updated dependencies [b92d76e]
- Updated dependencies [f325775]
- Updated dependencies [c36608c]
- Updated dependencies [5974429]
- Updated dependencies [af337d0]
- Updated dependencies [b5b5880]
  - octane@0.1.13
  - @octanejs/tanstack-router@0.1.12

## 0.1.1

### Patch Changes

- 04cdedc: Publish the repository-owned Octane TanStack Start integration, including its
  runtime adapters, TSRX route generation, server-function compiler, and Vite
  plugin, and extend the Octane router binding with the Start SSR surface.
- Updated dependencies [04cdedc]
- Updated dependencies [a88f9ea]
- Updated dependencies [443bba7]
- Updated dependencies [d388e80]
- Updated dependencies [2f2a204]
- Updated dependencies [0223241]
- Updated dependencies [f9234f6]
- Updated dependencies [fa11116]
- Updated dependencies [ec7ffbf]
- Updated dependencies [25d266b]
- Updated dependencies [d388e80]
  - @octanejs/tanstack-router@0.1.11
  - octane@0.1.12
