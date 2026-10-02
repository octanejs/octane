---
'octane': patch
---

Call `hydrateRoot`'s `onRecoverableError` when hydration discards server content
for an `@if` arm the client does not render, a list's items or `@empty` arm that
the client replaces with the other arm, a branch range the server encoded as
something else, or a runtime host element's content. These recoveries already
rebuilt the DOM but reported nothing, in development or production.
A boundary that retries hydration after suspending reports a list's arm swap once,
and a dormant boundary whose props changed before it activated still repairs these
ranges without reporting or warning.
