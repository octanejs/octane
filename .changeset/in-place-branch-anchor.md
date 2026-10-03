---
'octane': patch
---

Hydrate a single-root component whose body is an `@if` or `@switch`, called where the server rendered another branch's markup. Hydration renders such a call in place of the server node it finds there, but the branch inside the component bounded its content against that node. When the branch's root did not match the node, recovery rebuilt the root and removed the node, and `hydrateRoot` threw `NotFoundError` and left the container empty. This happened in development and production builds, for an element or component arm, including when the call was its host's last child or the last root of an arm's fragment. When the root matched, hydration adopted it outside the branch's range, so switching the branch to another arm left the server's node on screen next to the new arm. The call now renders before the node after the server's node, so the branch bounds exactly its own root. A mismatch is still reported once through `onRecoverableError`.
