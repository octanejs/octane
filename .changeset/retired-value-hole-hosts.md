---
'octane': patch
---

A host rendered into a value hole, such as `{show && <div onBlur={…}><input /></div>}`,
no longer runs its handlers for the `focusout` that the browser dispatches while
the host is being removed. The component that rendered it stays mounted, so
these hosts are now retired when they are removed rather than when a component
unmounts. This covers value holes, nested `createElement` children, a host
whose tag changes, a root that renders a descriptor, and removals published by
a View Transition. Still-mounted ancestors keep receiving the event, and an
event that was already being delivered keeps its handlers until it finishes.
