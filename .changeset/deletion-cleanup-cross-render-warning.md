---
'octane': patch
---

Stop reporting a deleted subtree's cleanup as a render-phase cross-component update.

Octane discovers a deletion while reconciling the deleting parent's output, so
`CURRENT_BLOCK` still names that parent while the removed subtree's destroys and
cleanups run. A cleanup that calls `setState` on a surviving component was
therefore treated as a render-phase update: it logged `Cannot update a component
(X) while rendering a different component (Y)` and flagged the target for the
render-phase branch of the update-depth error.

Those callbacks are mutation-phase work (React runs them in
`commitDeletionEffects`), and updating another component from them is the normal
registry pattern, so they no longer take that branch. `@octanejs/radix`'s Select
hit this on every open and close: `SelectItemText`'s layout cleanup calls
`onNativeOptionRemove` on the Select provider as the content swaps between its
detached fragment and the open popper.

Genuine render-body updates are unaffected: those run with no cleanup on the
stack and still warn and still terminate the loop.
