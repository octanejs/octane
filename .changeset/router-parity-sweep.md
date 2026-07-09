---
'octane': patch
---

Runtime: two error/suspense boundary fixes surfaced by the @octanejs/tanstack-router
parity work. (1) A catch-less `tryBlock` that receives an error mid-render now
RETHROWS instead of synchronously delegating to the parent boundary's handler —
delegation let the frames between the throw site and the outer boundary keep
rendering into DOM the outer boundary's switch had already swept (stale-anchor
`insertBefore` NotFoundError replacing the original error). (2) An update
scheduled for a block inside a suspense-hidden subtree (try content
soft-detached to `savedDom` while the fallback shows) now re-attempts the WHOLE
boundary — reattach, render, reveal on success / re-stash on re-suspend — per
React's "setState on a suspended component retries the render" semantics,
instead of rendering the block against detached DOM geometry. Compiler:
method-style hook calls (`route.useLoaderData()`, `api.useSearch()`) now get
per-call-site slot wrapping (`withSlot` thunk preserving `this`), enabling
object-carried hooks like TanStack Router's Route/RouteApi accessors.
