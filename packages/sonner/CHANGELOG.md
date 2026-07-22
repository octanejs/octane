# @octanejs/sonner

## 0.1.8

### Patch Changes

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

## 0.1.7

### Patch Changes

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
  - octane@0.1.12

## 0.1.6

### Patch Changes

- Updated dependencies [f7e1cba]
- Updated dependencies [082b681]
- Updated dependencies [9d86d20]
- Updated dependencies [082b681]
- Updated dependencies [742ae9d]
- Updated dependencies [2932a23]
- Updated dependencies [e0c2f09]
- Updated dependencies [082b681]
- Updated dependencies [082b681]
  - octane@0.1.11

## 0.1.5

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.1.4

### Patch Changes

- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9

## 0.1.3

### Patch Changes

- Updated dependencies [156f213]
- Updated dependencies [2a5f44f]
- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [1b21731]
- Updated dependencies [7a123d2]
- Updated dependencies [95b3081]
- Updated dependencies [38d95eb]
- Updated dependencies [ba36091]
- Updated dependencies [6ccdbce]
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [7efdbdd]
- Updated dependencies [314b38d]
- Updated dependencies [dcd2707]
- Updated dependencies [d63b0d0]
- Updated dependencies [39e779c]
- Updated dependencies [1b21731]
- Updated dependencies [f07c628]
- Updated dependencies [fac1c66]
- Updated dependencies [dbbcee1]
- Updated dependencies [5287eac]
  - octane@0.1.8

## 0.1.2

### Patch Changes

- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7

## 0.1.1

### Patch Changes

- f96a1f9: Add the `@octanejs/sonner` port of Sonner 2.0.7, including the complete toast
  API, Toaster UI and styles, promise and custom toasts, targeted toaster support,
  SSR/hydration support, and differential parity coverage against real Sonner on
  React. Register the new binding with the MCP package bridge.
- Updated dependencies [d173805]
- Updated dependencies [85e589e]
- Updated dependencies [2979f42]
- Updated dependencies [b41a91a]
- Updated dependencies [e55f6ed]
- Updated dependencies [d173805]
- Updated dependencies [813fd50]
  - octane@0.1.6
