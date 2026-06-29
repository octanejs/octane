---
"octane": patch
---

Suspense now cycles host refs across a suspend like React does: when a boundary
suspends, host refs in the hidden subtree are detached (object refs set to `null`,
callback refs invoked with `null`) and re-attached on reveal — even though octane
preserves the DOM node (React preserves it too, as `hidden`). Previously octane left
the ref pointing at the detached/hidden node, so a callback ref never saw `null` and an
object ref's `.current` stayed populated while the content was behind the fallback.

This covers the compiled template host-ref path (`<span ref={...}/>`) and de-opt host
slots (value-position / motion-style hosts). Refs attached purely through closures
(prop spread, the de-opt prop path, fragment refs) are not yet cycled. Per
`ReactSuspenseEffectsSemantics-test.js:2877`.
