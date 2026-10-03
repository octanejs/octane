---
'octane': patch
---

Read a deferred JSX value's fields once each time a child slot classifies it. A component that passes JSX as props, as in `<Viewport layers={<><Chart /><Legend /></>} />`, had each of those values classified again on every re-render of the receiving component, and each field read ran the value's accessor and resolved its record. Classification now reads the type once and passes it along, de-opt list keys are read once per child, and a component descriptor's key and invocation site are read only when a new instance mounts. A deferred record that read no context now returns from its resolver without inspecting the current scope. In the svg-dashboard benchmark this cuts accessor calls per tooltip commit from 88 to about 25, for the same slot visits. Rendering, keys, context updates, and signal instance identity are unchanged.
