---
'octane': patch
'@octanejs/tanstack-start': patch
'@octanejs/tanstack-router': patch
'@octanejs/zustand': patch
'@octanejs/sonner': patch
---

Fixes surfaced by porting tanstack.com to Octane (Phase 2c of the tanstack-com benchmark):

- **octane compiler**: multi-line JSX string attributes no longer emit invalid JS (hostValue/spread, createElement de-opt, and SSR warm-child paths all re-derive the literal from its cooked value); TS `this` parameters are fully erased instead of surviving as parameter names; warm-child plans quote non-identifier prop keys (`aria-*`, `data-*`); direct calls to octane's `lazy` are emitted with `/* @__PURE__ */` so unused lazy declarations tree-shake like `React.lazy`; the vite plugin adds `.tsrx` to `resolve.extensions` so extensionless imports resolve like `.tsx`.
- **@octanejs/tanstack-start**: new partial-hydration surface (`Hydrate` + `visible`/`idle`/`load`/`never`/`media`/`condition`/`interaction` via `./hydration`); `<ClientOnly>` children are now stripped from server compiles (octane analogue of the start-compiler's `handleClientOnlyJSX`), letting import-protection's tree-shake verification pass for `*.client.*` modules; import-protection's transform filter now covers `.tsrx` importers.
- **@octanejs/tanstack-router**: the route-generator masker passes plain `.ts`/`.tsx` route files through untouched instead of feeding them to the TSRX parser.
- **@octanejs/zustand**: `UseBoundStore` type is exported (upstream parity).
- **@octanejs/sonner**: type-only names are re-exported with `export type` so compiled consumers don't reference erased bindings.
