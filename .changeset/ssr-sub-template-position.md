---
'octane': patch
---

Two server-runtime fixes surfaced by the first production SSR build of an @octanejs/tanstack-router app:

- `octane/server` now exports `flushSync` (server semantics: a render is synchronous and there is no update queue, so it runs the callback and returns its result — mirroring `startTransition`) and `isChildrenBlock`/`markChildrenBlock` (same `Symbol.for` key as the client runtime, so identity holds across mixed graphs). Router code importing these compiled fine for the client but failed to resolve in any SSR module graph.
- Server compiler: synthetic subs (`@if`/`@for`/`@switch`/`@try` branches and `__schildren` component children) are now always compiled in TEMPLATE position. They previously reset to VALUE position, which made `ssrEmitComponent` take the descriptor-children path inside every sub — silently DROPPING directive-block children of nested components (`lowerJsxChild` cannot lower an `@if` to a descriptor) and desyncing the server block count from the client (which compiles those branches through the template walk). A `<C>@if (…) { … }</C>` nested one sub deep — e.g. the router's `Provider > CatchBoundary > @if { <Match/> }` chain — server-rendered `<C>` childless, blanking whole pages.
