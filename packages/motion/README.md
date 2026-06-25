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
  `exit`, plus any DOM props (className, style, events, …) spread onto the element.
- `AnimatePresence` — exit animations on removal.
- `layout` — FLIP layout animations (single-element; see caveat below).
- `useAnimate()` — imperative, scoped animations: `[scope, animate]`.
- Motion's framework-agnostic helpers (`animate`, `stagger`, value types, …),
  re-exported.

## How it works

octane has no public way for a runtime-proxy component to render a host element
wrapping children, so this package added one to the runtime — `hostComponent`.
`motion.<tag>` renders a real `<tag>` through it, captures the node, and drives:

- **Animations** from layout effects calling motion's `animate()`.
- **Gestures** via motion's `hover()` / `press()` on the node.
- **Exit** without any deferred-deletion machinery: octane fires cleanups *before*
  detaching the DOM, so a leaving element's unmount cleanup clones it (positioned in
  place, appended outside the range octane is about to remove), animates the exit on
  the clone, and removes the clone when it finishes.
- **`layout`** via FLIP: each commit it measures the element's box (transform reset),
  and if it moved/resized vs the previous commit applies the inverse transform then
  animates it back to identity. `useAnimate` reuses motion's `createScopedAnimate`.

## Not yet ported

`drag`, `variants` propagation, `MotionConfig`, `useMotionValue`, scroll-linked
animations, and the full layout **projection** tree — nested/shared-element layout
and scale correction (the `layout` here is a single-element FLIP).
