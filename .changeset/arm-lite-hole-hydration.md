---
'octane': patch
---

Hydrate a hookless component call at a hole in an `@if` or `@switch` arm when the server rendered another arm with the same static roots, in development builds. The server node at the call's position is an element of the other arm, not the component's range. A component that renders several roots deleted the arm's adopted node after the hole, a component that renders a fragment or nothing left the other arm's element on screen, and a single-root call inside one of the arm's host elements left that element before its own root. The call now takes the place of exactly that server node, as it already did in production builds, and hydration reports the mismatch once through `onRecoverableError`.
