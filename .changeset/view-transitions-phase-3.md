---
'octane': patch
---

View Transitions phase 3: Suspense integration + scheduling depth. Suspense
reveal commits (fallback → content, standalone or the entangled held-
transition batch) now route through the view-transition controller — a
boundary wrapping the Suspense update-activates on the swap, and boundaries
inside the revealed content enter. Nested boundaries inserted/removed as ONE
unit fire only the outermost enter/exit (React's rule; nested stay silent).
`render()` called inside a transition no longer commits synchronously — it
schedules at transition priority, so boundaries mounting with the initial
content enter-animate (e.g. a Suspense fallback appearing under a
`<ViewTransition>`). Passive effects scheduled during an animation now wait
for the transition's `finished` (React's ordering); update detection also
catches element replacement (identity, not just count).
