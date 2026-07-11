---
'octane': patch
---

View Transitions phase 2: shared-element transitions + transition types + the
full callback contract. Same-named boundaries deleted/inserted in one
transition-lane commit now pair as a shared-element transition (`onShare`
fires on the exiting side, suppressing its `onExit` and the entering side's
`onEnter`; pairs decay to separate exit/enter when either side is outside the
viewport). New `addTransitionType` (+`unstable_addTransitionType`) tags the
current transition batch — the types array reaches every on\* callback, and
`enter`/`exit`/`update`/`share`/`default` class props now resolve strings,
`'auto'`, `'none'` (deactivates the boundary), or per-type maps
(`{ 'nav-back': 'slide-right', default: 'auto' }`), applied as
`view-transition-class` alongside the name. Callbacks now receive
`(instance, types)` where the instance carries `.animate()`-capable handles
for the boundary's `old`/`new`/`group`/`imagePair` pseudo-elements, and a
returned cleanup runs before the boundary's next activation.
