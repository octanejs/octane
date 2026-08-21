---
'octane': patch
---

Improve Activity parity across compiled JSX, element descriptors, server rendering,
hydration, and universal renderers. Hidden boundaries now disconnect public refs,
preserve the latest authored styles and text, hide logically owned portals, and
contain suspended work without activating an enclosing visible fallback. Retained
insertion effects replay safely after suspended hidden renders, including memoized
children and nested boundaries.

Support Activity aliases, namespaces, spreads, children props, and ordered keys
without changing the direct mode-only compiler fast path. Integrate Activity
visibility changes with ViewTransition enter/exit animations and expose native
pseudo-element animations through the transition instance.

Coalesce hidden descendant visibility scans once per render wave and keep optional
Activity implementation and ref tracking off unrelated application paths. Add
production browser benchmarks and deterministic work, ref, and bundle controls.
Octane's synchronous hidden-work scheduling and existing structural-transaction
limitations remain unchanged.
