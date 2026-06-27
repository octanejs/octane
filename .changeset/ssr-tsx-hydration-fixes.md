---
"octane": patch
---

SSR + hydration: render and hydrate a full app (deeply nested providers, a fragment-returning component with an empty child, and the router `Match` boundary shape) without a cursor desync. Fixes a family of bugs where the server and client serialized the SAME component tree to a different `<!--[-->…<!--]-->` block structure, so hydration adopted the wrong server node and a descendant boundary threw `TypeError: el.setAttribute is not a function` (the boundary then rebuilt, doubling the DOM).

Compiler:

- `.tsx` value-position component children now serialize as `createElement(...)` DESCRIPTORS on the server, matching the client. A React-style `return <Provider><Child/></Provider>` body lowered `Child` to a `__schildren` render-fn server-side (which `ssrChild` wraps in its own block) but to a `createElement` descriptor client-side (one block) — one block deeper on the server. `@{}` (template-position) bodies keep the render-fn on both sides.
- Appended children (fragment children / a control-flow-only body, all anchored at the block end marker) emit in SOURCE order. They were grouped by type (for → if → component), so e.g. `<><Foo/> @if{…}</>` ran the `@if` before `<Foo/>` — reversing DOM order vs the source-order server output and desyncing hydration.
- Nested JSX inside a server `{cond && <jsx/>}` child hole and inside a server component prop (e.g. `fallback={(e) => <Fallback/>}`) now lowers to `createElement(...)` instead of leaking raw, unparseable JSX into the emitted server module.

Runtime:

- `octane/server` now exports the `Suspense` and `ErrorBoundary` JSX built-ins (the component forms of `@try`/`@pending`/`@catch`), so authors writing `.tsx` Suspense/error boundaries can server-render them.
- `childSlot` no longer sweeps the adopted server DOM when first rendering a component descriptor during hydration (it was deleting the very nodes it was about to adopt, stranding the cursor).
- `componentSlot` / `childSlot` advance the hydration cursor past a component's adopted range after rendering, so a following sibling adopts the right node — fixes an EMPTY component (`<></>`, e.g. a render-nothing effect component) leaving the cursor on its own close marker.
- `tryBlock` / `ifBlock` adopt the server range from the parked cursor when they are the SOLE hole of an enclosing scope (so their anchor is the scope's end marker, not a block-open), via a shared `resolveHydrationOpen` helper — the same dual-branch logic `componentSlot` already had.
