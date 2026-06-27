---
"octane": patch
---

Compiler: emit smaller mount code for two common shapes.

- **No binding bag for control-flow-only bodies.** A component/branch body whose
  output is purely control flow or component slots (no static HTML — e.g. the
  recursive `Node` in a deep tree, an `@if` wrapper, a Provider/portal body) no
  longer allocates a per-render binding-bag object or commits it to `slots[0]`.
  Its hosts are `__block.parentNode` (recomputable every render) and its anchors
  `__block.endMarker`, so the `let _b … if (_b === undefined) { _b = {}; … } else {}`
  scaffold is dropped entirely and slots start at index 0. This removes one object
  allocation per such block instance (meaningful for control-flow-heavy trees) and
  shrinks the compiled output (~24% smaller for the recursive-context benchmark's
  component).

- **Shared DOM-navigation prefixes.** Template element references are now walked
  incrementally from the nearest already-materialized ancestor instead of
  re-walking the whole path from the cloned root for every hole. Siblings that
  share a deep prefix (e.g. a row of buttons) reuse the prefix's navigation var
  rather than repeating `child(child(child(_root)))` per element — fewer
  `child`/`sibling` calls at mount and less repeated code.

Compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build
output). No public component-API or behavior change.
