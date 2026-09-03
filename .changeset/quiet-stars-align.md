---
'octane': patch
---

Fix JSX ordering, whitespace, entities, keyed hosts and portals, parser-sensitive
markup, document roots, and Suspense warming. Correct transition ownership,
queued state updates, deferred values, effect cleanup and error delivery, native
event dispatch, uncontrolled form defaults, form actions, and style updates.
Preserve dispatch order across consecutive and awaited Actions, retain committed
child inputs during urgent parent updates, and keep third-tuple getters available
to bindings that supply their own hook slots.
Preserve authored custom-hook arguments and symbol initial values through aliases.

Escape application strings in every server renderer, accept renderable roots,
recover buffered Suspense errors, and report hydration recoveries consistently.
Add React-named migration types, StrictMode and batching pass-throughs, the
useFormState alias, and server version exports. Document intentional differences
in template children, branch identity, native events, scheduling, and SSR.
