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
- An ONLY-CHILD `{expr}` value hole (the host's sole content) now lowers FULLY
  MARKERLESS, exactly like a `.tsrx` `{… as string}` text hole: a primitive value
  is a single Text node appended to the host — no `<!>` placeholder, no slot state,
  no end marker — and only an object/function (component / element / array) lazily
  mints markers via `childSlot`. New runtime `childTextHole` + server `ssrChildText`
  (a primitive serializes as the host's bare text; an object keeps its
  `<!--[-->…<!--]-->` block) so hydration adopts either shape. (Sibling-position
  value holes keep a single placeholder via the `ownEnd` reuse above.) This removes
  the per-cell hole-aware `child`/`sibling` navigation + `insertBefore` that the
  marker forced.

No API or behavioural change. On the dbmon update benchmark (1000-row table) this
brings `.tsx` to PARITY with `.tsrx` on every op (and byte-identical markerless
DOM): full-table `tick` ~2.1ms → ~1.4ms, partial `tick` ~0.9ms → ~0.5ms,
mount ~5.9ms → ~4.4ms, remount ~5.2ms → ~3.9ms.
