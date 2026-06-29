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

Effects are also destroyed exactly ONCE when a boundary suspends in multiple places
(a partial resolve that leaves it suspended does not re-destroy or recreate them), and a
nested inner-boundary re-suspend destroys only the inner subtree's effects, not the
outer boundary's.

Implementation: the suspend-hide paths run the hidden subtree's cleanups via
`deactivateScope` (clearing effect deps so they re-fire on reveal) and mark the hidden
tryBlock `inactive` so a re-suspend during a resume doesn't leave its enqueued effects
stuck; the resume retry now commits effects on both the reveal and re-suspend paths
(this also fixes a latent issue where a resume's layout effects weren't committed until a
later flush, leaving the scheduler non-quiescent). Per `ReactSuspenseEffectsSemantics-test.js`.
