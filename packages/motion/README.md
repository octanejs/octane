# @octane-ts/motion

[Framer Motion](https://motion.dev) for the [octane](https://github.com/octane-ts/octane) renderer.

Motion separates a framework-agnostic animation engine (`animate`) and gesture
primitives (`hover`, `press`) from its React components (`motion.div`,
`AnimatePresence`). This package reuses the engine + gestures verbatim and
reimplements the components on octane.

```tsx
// before
import { motion, AnimatePresence } from 'motion/react';
// after
import { motion, AnimatePresence } from '@octane-ts/motion';

function Card() @{
  <motion.div
    className="card"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    {'hello'}
  </motion.div>
}

function List(props) @{
  <AnimatePresence>
    @if (props.show) {
      <motion.div exit={{ opacity: 0 }}>{'I fade out when removed'}</motion.div>
    }
  </AnimatePresence>
}
```

## What's bound

- `motion.<tag>` — `initial`, `animate`, `transition`, `whileHover`, `whileTap`,
  `whileFocus`, `whileInView` (+ `viewport`), `exit`, `drag` (+ `dragConstraints`,
  `onDrag*`), `layout`, `layoutId`, `variants`, plus any DOM props (className, style,
  events, …) and `style` MotionValues spread/bound onto the element.
- `AnimatePresence` — exit animations on removal.
- `MotionConfig` — global `transition` / `reducedMotion` defaults via context.
- `variants` — label resolution (`animate="visible"`) + parent→child propagation.
- `useMotionValue()`, `useScroll()`, `useAnimate()` — MotionValues, scroll-linked
  values, and imperative scoped animation.
- Motion's framework-agnostic helpers (`animate`, `stagger`, value types, …),
  re-exported.

## How it works

octane had no public way for a runtime-proxy component to render a host element
wrapping children, nor to provide context from plain-TS — so this package added two
runtime primitives: `hostComponent` and `provideContext`. `motion.<tag>` renders a
real `<tag>` through `hostComponent`, captures the node, and drives:

- **Animations** from layout effects calling motion's `animate()`; **gestures** via
  `hover()` / `press()` / `inView()`; **MotionValues** (from `useMotionValue` /
  `useScroll`) by subscribing in `style` and writing the element directly.
- **`MotionConfig` + `variants`** through `provideContext`: a plain-TS component
  stamps context for its children (config defaults, active variant labels).
- **`drag`** with pointer events (axis lock + `dragConstraints`).
- **Exit** without any deferred-deletion machinery: octane fires cleanups *before*
  detaching the DOM, so a leaving element's unmount cleanup clones it (outside the
  range octane is about to remove), animates the exit on the clone, and removes it
  when it finishes.
- **`layout` / `layoutId`** via FLIP: measure the box, and if it moved/resized —
  vs the previous commit (`layout`) or a same-id element that just unmounted
  (`layoutId`) — apply the inverse transform then animate it back to identity. The
  same cleanup-before-detach ordering lets a leaving `layoutId` element record its
  box for the next one.

## Not yet ported

The full layout **projection tree** — nested projection, child scale correction, and
continuous shared-layout during drag (the `layout`/`layoutId` here are single-element
FLIPs). Also `staggerChildren` / `delayChildren` orchestration, motion-value
composition hooks (`useTransform` / `useSpring` / `useMotionValueEvent`), drag
momentum/elastic physics, and reduced-motion enforcement.
