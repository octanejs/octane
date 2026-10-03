---
'octane': patch
---

Hydrate an `@if` or `@switch` at a hole in an `@if`/`@switch` arm when the server rendered another arm with the same static roots. The hole's position then holds an element or text of the other arm, not the slot's range. The slot used to treat that node as the node after it: a branch with several roots adopted it and the arm's next static root as well, so a node was lost silently, and later updates left the server node on screen or duplicated content. An empty branch kept the server node, a branch after one of the arm's adopted roots deleted that root, and a single-root branch that did not match threw `NotFoundError` from `hydrateRoot`. The slot now takes the place of exactly that server node. It adopts the node when its branch is that node, otherwise it rebuilds over the node or removes it and reports the mismatch once through `onRecoverableError`. The arm's adopted nodes keep their identity and keep updating.
