---
'octane': patch
---

React Float behavioral parity: hoist exclusions and hint semantics.

Document-metadata hoisting now honors React's exclusions — `itemProp`-bearing
`<meta>`/`<link>` stay with their `itemScope` host, and metadata/resources that
are direct children of `<noscript>` stay in the fallback content — on the
client and the server, so hydration adopts the identical shape.

Resource hints gain React's option semantics: font preloads always fetch
anonymously (`crossorigin=""`), preload-seeded connection/integrity options
transfer onto the matching `preinit`'s real tag (the server coalesces the
redundant preload out of the head fold), `preconnect` identity includes the
CORS mode, responsive image preloads omit the fallback `href`, unknown option
keys are dropped, and non-string hrefs warn in development and no-op. A module
src is one executable identity across `preinitModule` and
`<script async type="module" src>` in both the server pass and the hydrating
client — no more duplicate module scripts in the cross pairings.
