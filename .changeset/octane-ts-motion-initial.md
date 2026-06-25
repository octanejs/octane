---
"@octane-ts/motion": patch
---

Initial release: Framer Motion bindings for octane.

Reuses motion's framework-agnostic engine (`animate`), gesture primitives (`hover` / `press` / `inView`), MotionValues, `scroll`, and `createScopedAnimate`, and reimplements the components on octane's new `hostComponent` + `provideContext` primitives.

Ships `motion.<tag>` (`initial` / `animate` / `transition` / `whileHover` / `whileTap` / `whileFocus` / `whileInView` / `exit` / `drag` / `layout` / `layoutId` / `variants` + spread DOM props and `style` MotionValues), `AnimatePresence`, `MotionConfig`, and the `useAnimate` / `useMotionValue` / `useScroll` hooks, plus a verbatim re-export of motion's agnostic helpers.

Notable mechanics: exit animations need no deferred deletion (octane fires cleanups before detaching the DOM, so a leaving element animates out on a surviving clone); `MotionConfig` + variant propagation use `provideContext`; `layout`/`layoutId` animate via single-element FLIP. Most motion component code works by changing the import from `motion/react`.

Not yet ported: the full layout projection tree (nested/scale-correction/continuous shared-layout), stagger orchestration, motion-value composition hooks, drag physics, and reduced-motion enforcement.
