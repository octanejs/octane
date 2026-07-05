---
"octane": patch
---

De-opt reconciler removal paths now detach refs on NESTED descendants, not just the
removed subtree's root. Removing a value-position pure-host tree (e.g.
`createElement('div', null, createElement('span', { ref }))` toggled to `null`, a
keyed array child leaving the list, or a subtree dropped by a re-render) previously
left an object ref on a nested element pointing at a detached node — and never fired
a nested callback ref's `null` call / React-19 cleanup. All removal sites now walk
the subtree (`detachDeoptTreeRefs`), skipping foreign portal ranges, whose refs
belong to their still-mounted portal.
