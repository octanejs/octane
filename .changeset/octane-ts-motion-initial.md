---
"@octane-ts/motion": patch
---

Initial release: Framer Motion bindings for octane.

Reuses motion's framework-agnostic animation engine (`animate`), gesture primitives (`hover`, `press`), and `createScopedAnimate`, and reimplements the components on octane's new `hostComponent` primitive. Ships `motion.<tag>` (`initial` / `animate` / `transition` / `whileHover` / `whileTap` / `exit` / `layout` + spread DOM props), `AnimatePresence`, and `useAnimate`, plus a verbatim re-export of motion's agnostic helpers. Exit animations work without deferred deletion (octane fires cleanups before detaching the DOM, so a leaving element animates out on a surviving clone), and `layout` animates via a single-element FLIP. Most motion component code works by changing the import from `motion/react`.
