---
"octane": patch
---

SSR: support the router `Match` boundary shape (`@try { <Component/> } @pending { … }`) end-to-end.

- `octane/server` now exports `withSlot` and `startTransition`. A server build of a `.tsrx` that defines/uses a custom hook (whose inner hook calls the compiler lowers through `withSlot`) or calls `startTransition` — exactly what the `@octanejs/router` bindings emit — previously failed to resolve those imports from `octane/server`. The server `withSlot` invokes the wrapped hook with its args (no per-call-site slot tracking is needed in a single synchronous render pass); the server `startTransition` runs its callback synchronously, matching the existing server no-op transition hooks.
- Hydration of a `@try`/Suspense boundary whose success-arm body is a COMPONENT (the router `Match` shape) now ADOPTS the server DOM instead of throwing. The component-block adoption paths (`componentSlot`, `componentSlotLite`, `forBlock`) now adopt the server's `<!--[-->…<!--]-->` range from the parked hydration cursor when the slot is the sole hole of a control-flow arm — so its anchor is the arm's end marker rather than a block-open — mirroring the cursor-based adopt branch `childSlot` already had. Previously the cursor stayed parked on the component's open marker, so the inner mount cloned a comment node and dereferenced `firstChild`/`appendChild` on it (`TypeError`/`DOMException`), forcing the boundary to its `@catch`/rebuild path.
