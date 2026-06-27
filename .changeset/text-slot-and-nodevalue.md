---
"octane": patch
---

Speed up text-heavy keyed-list updates (the `.tsx` `{expr}` value-hole path).

- A renderable `{expr}` value hole now compiles to a small `textSlot` wrapper
  instead of calling `childSlot` directly. `childSlot` is a large function (it
  classifies arrays / host descriptors / element descriptors / components) that
  V8 won't inline, so paying that call per cell dominated update-heavy keyed
  lists. `textSlot` handles the common case inline — a primitive value into a
  slot already in text mode — and delegates to the full `childSlot` only for
  objects/functions, the first render, or a slot holding non-text content.
  Behaviour is identical (it's a transparent fast-path).
- Text-node writes use `node.nodeValue` instead of `node.data` (a `Node`-level
  accessor vs `CharacterData` one prototype hop deeper) across `setText`,
  `textSlot`, `childSlot`, and the de-opt reconciler — measurably faster on the
  hot text-update path (this also speeds the `.tsrx` `{… as string}` `setText`
  path).

On the dbmon update benchmark (1000-row table), `.tsx` `tick` dropped ~10% and
partial updates more; no API change.
