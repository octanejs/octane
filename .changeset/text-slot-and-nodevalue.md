---
"octane": patch
---

Make React-style `.tsx` `{expr}` value-hole updates as fast as a `.tsrx`
`{… as string}` text binding.

- A renderable `{expr}` child in a template body now compiles to an INLINE
  text-hole fast path: the text node + last value are cached on the binding bag
  (`_chv`/`_chp`), and on update — when the value is an unchanged-skippable
  primitive already backed by a text node — it does a direct `setText`, exactly
  like the `.tsrx` text-binding hot path. Objects/functions (component / element /
  array), the first render, and mode switches go through a `textHole` slow path
  that delegates to the full `childSlot`. Previously every value hole called
  `childSlot` per render — a large function V8 won't inline, with a slot-state
  indirection — which dominated update-heavy keyed lists. (A control-flow-only
  `noTemplate` body, which has no bag, uses a small `textSlot` wrapper instead.)
- Text-node writes use `node.nodeValue` instead of `node.data` (a `Node`-level
  accessor vs `CharacterData` one prototype hop deeper) across `setText`,
  `childSlot`, the inline text-hole, and the de-opt reconciler — faster on the hot
  text-update path (also speeds the `.tsrx` `setText` path).

No API or behavioural change. On the dbmon update benchmark (1000-row table) this
closed the `.tsx` gap to `.tsrx`: full-table `tick` ~2.1ms → ~1.5ms and partial
`tick` ~0.9ms → ~0.5ms (both now matching the `.tsrx` column).
