---
'octane': patch
---

Hydrate a single-root component call that is its host element's last child when the server rendered a different element there. Hydration rebuilds the component's root in place of that element. In any production build, and in a development build for a component with hooks, `hydrateRoot` threw `NotFoundError` and left the container empty: the rebuilt root was inserted before the server element it had just removed. The rebuilt root is now appended where that element stood. The mismatch is reported once through `onRecoverableError`, and the server siblings before it keep their identity.
