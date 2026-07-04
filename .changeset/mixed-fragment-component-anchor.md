---
"octane": patch
---

Compiler: fix reversed child order when a component root precedes a static host root
in a multi-root fragment body.

A component authored as `<><Comp/><input/></>` (or whose children are threaded through
`createElement` as a compiled children fragment — e.g. a headless UI binding that renders
`createElement('fieldset', { children })`) dropped the component root's source-order `<!>`
anchor. The static template content drained into the parent first and the component was
appended at `endMarker` AFTER it, so `<Comp/>` before `<input/>` rendered as
`<input/>` then `<Comp/>`. The fix emits the `<!>` anchor for a component root in a mixed
body, mirroring the in-element mixed-children path and the control-flow root path — so the
component mounts at its source position. The server already emitted source order, so this
also removes a client/server divergence that could mis-adopt on hydration.
