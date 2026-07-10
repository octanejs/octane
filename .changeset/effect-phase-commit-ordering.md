---
'octane': patch
'@octanejs/testing-library': patch
---

React-parity effect commit + deletion ordering — the last two `useInsertionEffect` parity gaps. The commit now mirrors React's per-fiber mutation walk (`commitMutationEffectsOnFiber`): per component in tree post-order, destroy ALL of its insertion effects, create ALL of them, then destroy its layout effects — so a sibling's layout cleanups land before a later sibling's insertion work, and insertion destroy/create pairs group per component (matters to CSS-in-JS style recycling); layout bodies still run afterwards in the layout phase, after ref attach. Unmount is now phase-correct too (`commitDeletionEffectsOnFiber`): a deleted component's insertion + layout cleanups fire synchronously in hook DECLARATION order (React's forward effect-list walk — previously one reverse-registration unwind), and passive (`useEffect`) cleanups are DEFERRED to the passive flush (React's `commitPassiveUnmountEffects`) instead of running synchronously at unmount, with errors still routed to the try boundary enclosing the deletion.

**Observable change:** `useEffect` cleanups no longer run synchronously during unmount — they fire in the next passive flush (post-paint, or `drainPassiveEffects()`/`act()` in tests). `@octanejs/testing-library`'s `unmount()`/`cleanup()` flush them for you (RTL's act-wrapped contract).
