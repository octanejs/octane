---
"octane": patch
---

Transitions now commit entangled Suspense boundaries together (React's atomic-commit
contract). When a single `startTransition` causes several boundaries to suspend — sibling
`@try` blocks, or several off-screen component/branch swaps — octane now holds the prior
content of EVERY boundary until ALL their data is ready, then reveals them in one batch.
Previously each boundary revealed the moment its own promise resolved, so a transition
that fanned out to multiple regions could show a half-updated screen mid-transition (one
region's new content next to another region's stale content).

Implementation: a data-ready barrier in the runtime (`HELD_TRANSITIONS` / `STAGED_REVEALS`).
A boundary holding prior content for an in-flight transition stages its reveal as its data
resolves instead of committing immediately; when every held boundary in the transition is
data-ready the whole group flushes in one commit. `isPending` stays true until that batch.
Boundaries that leave the group abnormally (an urgent update superseding the transition, an
error, or unmounting) are dropped so the rest aren't left waiting. Closes the
"entangled-transition partial-commit" and "per-swap cross-boundary reveal" divergences.
