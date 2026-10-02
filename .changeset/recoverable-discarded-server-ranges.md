---
'octane': patch
---

Call `hydrateRoot`'s `onRecoverableError` when hydration discards server content
for an `@if` arm the client does not render, a branch range the server encoded as
something else, or a runtime host element's content. These recoveries already
rebuilt the DOM but reported nothing, in development or production. A list whose
server rendered its `@empty` arm while the client has items now reports at the
list itself, once, including when a suspended boundary or root retries
hydration. A dormant boundary whose props changed before it activated still
repairs these ranges without reporting or warning.
