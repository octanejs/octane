---
'octane': patch
---

Two hide/reveal fidelity fixes (React Offscreen parity):

- **Insertion effects stay connected while hidden** (per `Activity-test.js:1428`): hiding an `<Activity>` (or a suspended boundary) no longer runs `useInsertionEffect` cleanups, revealing no longer re-fires them, and a deps-changed update while hidden still cycles them — insertion effects own injected styles that must persist while a tree is merely hidden; only a real unmount tears them down. Each effect slot now records its phase so the hide machinery can single insertion effects out.
- **Closure-attached refs now cycle across a suspend** (per `ReactSuspenseEffectsSemantics-test.js:2877`): refs inside a spread object, `<Fragment ref>` instances, and refs on value-position pure-host descriptors (the de-opt path, nested elements included) are now detached when a boundary suspends and re-attached on reveal, matching the compiled template host-ref behavior. Previously these three flavors kept pointing at hidden DOM.
