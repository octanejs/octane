---
'@octanejs/motion': patch
---

Add Motion's reduced-motion, LayoutGroup, and lazy feature-loading surfaces.

`useReducedMotion` now follows live operating-system preference changes,
`MotionConfig` enforces reduced motion for positional and layout animation, and
`LayoutGroup` isolates shared `layoutId` transitions with collision-free,
commit-scoped snapshots. FLIP honors `layout="position"`, `layout="size"`, and
`transition.layout`. `LazyMotion`, `domAnimation`, `domMax`, the `m` proxy, and the
complete `./react-m` named host entry support feature-gated Motion usage without
React. The package also explicitly exposes Motion's `Transition` and
`TargetAndTransition` types.
