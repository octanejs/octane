---
'octane': patch
---

Hydrate a component call in an `@if` or `@switch` arm when the server rendered another arm with the same static roots. The client adopts the server arm's nodes through its template, so the server node at the call's position is an element of the other arm, not the component's range. A single-root call rebuilt over that element also deleted the adopted node after it. A keyed or dynamic call left the element on screen. A call after an adopted static root rebuilt over that root instead. The call now takes the place of exactly the server node at its position. The arm's adopted nodes keep their identity and keep updating, and hydration reports the mismatch once through `onRecoverableError`.
