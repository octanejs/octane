---
"octane": patch
---

Fix de-opt host descriptor refs (`{cond ? <div ref={r}/> : null}` and other value-position
host JSX) not being detached when the node is removed or its ref changes, leaving `ref.current`
(or a callback ref) pointing at a node no longer in the DOM.

`patchDeoptProps` now detaches the previous ref when it is removed or its identity changes (it
previously relied on `removeDeoptProp`, which intentionally no-ops `ref`), and the de-opt
removal paths (`clearChildContent` and the list/replace reconcilers) now detach a removed host
node's ref before dropping it.
