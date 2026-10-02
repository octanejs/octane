---
'octane': patch
---

Hydrate a component call at a hole in an `@if` or `@switch` arm when the server rendered another arm with the same static roots, for a call that cannot render in place of one server node. The server node at the call's position is an element of the other arm, not the component's range. A keyed or dynamic call, or a component that renders several roots, a fragment, or nothing, left that element on screen. A call after one of the arm's adopted roots also deleted that root. A component with several roots in a development build lost the adopted node after the hole. The call now replaces exactly the server node at its position, the arm's adopted nodes keep their identity and keep updating, and hydration reports the mismatch once through `onRecoverableError`.
