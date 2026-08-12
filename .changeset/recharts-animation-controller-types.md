---
'@octanejs/recharts': patch
---

Restore the `AnimationController` type module and fix the style-prop import in
`CSSTransitionAnimate`.

Upstream ships `animation/AnimationController.ts` as a types-only module whose
compiled JavaScript is `export {}`, so the vendoring pass, which copies compiled
`es6` output, skipped it. `CSSTransitionAnimate` imported the type from a module
that did not exist. `AnimationHandle` is reconstructed from the real
`JavascriptAnimation` and `CSSTransitionAnimation` classes.

`CSSTransitionAnimate` also imported `CSSProperties` from `octane`, which does
not export it. The style type is now derived from Octane's own JSX surface
instead, which avoids adding a `react` dependency this package does not have.
