---
'octane': patch
---

`<ViewTransition>` (experimental, React-parity core): transition-lane commits
that touch a boundary now run inside `document.startViewTransition` — enter
(subtree inserted), exit (subtree removed), and update (inner mutation /
size change) activations with auto view-transition-name assignment and
`onEnter`/`onExit`/`onUpdate` callbacks. Falls back to a plain synchronous
commit when the browser has no View Transitions support; `flushSync` and
urgent updates skip the animation (React's rule). Also exported as
`unstable_ViewTransition` so React-experimental imports port unchanged.
Shared-element `share`/`name` pairing, `addTransitionType`, Suspense-reveal
integration, and SSR annotations land in later phases
(docs/view-transitions-plan.md).
