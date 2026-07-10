---
'octane': patch
---

Marker elision M3: a component call that is the sole root of a `@{ … }` body now INHERITS its parent block's marker range on all three sides — the client borrows the parent's markers instead of minting a `comp`/`/comp` pair, the server skips the child's `<!--[-->…<!--]-->` frame pair, and hydration adopts nothing at the site. Sole-child wrapper chains (layout stacks, `<ctx.Provider>` router/binding wrappers, member and dynamic tags included) collapse to the outermost pair with zero comments per layer. `key=` sites and the boundary builtins (Suspense/ErrorBoundary/Activity — declined by identity at runtime, so aliased/member references are safe) keep their pairs. As a side effect, a component-form and a bare-element-form of the same markup now serialize identically and cross-reconnect clean during hydration, matching React.
