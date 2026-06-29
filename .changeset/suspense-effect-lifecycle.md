---
"octane": patch
---

Suspense now matches React's effect lifecycle: when an already-committed boundary
RE-SUSPENDS (its content is hidden behind the fallback), the hidden subtree's layout
and passive effects are DESTROYED (their cleanups run), and they are RECREATED when the
content reveals again. Previously octane's suspend hold preserved the subtree's effects,
so a suspended component's subscriptions/timers/observers kept running while the fallback
was shown. Component state (useState/useMemo/useRef) is still preserved across the
suspend — only effects destroy/recreate, exactly like React.

Implementation: the suspend-hide paths run the hidden subtree's cleanups via
`deactivateScope` (clearing effect deps so they re-fire on reveal), and the resume retry
now commits the recreated effects (this also fixes a latent issue where a resume's layout
effects weren't committed until a later flush). Per
`ReactSuspenseEffectsSemantics-test.js`.
