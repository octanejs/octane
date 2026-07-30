---
'octane': patch
---

Fix hydration mismatch recovery corrupting the DOM when a branch adopts a
non-spanning server range.

When an `@if`/`@switch` (or an `@if`-lowered ternary) hydrates a slot whose
server content leads with a nested `<!--[-->…<!--]-->` pair, the branch adopted
that first pair as its own range without checking that the pair spans the whole
slot. Against a differently-encoded server shape — for example a legacy
value-hole list serialized as an outer pair plus one pair per keyed item — the
branch then owned only a prefix of the slot: the next branch swap left the
stranded remainder on screen next to the new arm, and re-entering the original
arm mounted into detached anchors, rendering nothing (or throwing
`NotFoundError` on insertion, depending on the shape). Recovery must never
crash or leak — it is the production safety net for stale server HTML.

The branch adoption now verifies the nested pair reaches the slot's close
marker. When it does not, the runtime treats it as a structural hydration
mismatch: it warns in development, discards the server range, and client-builds
the branch fresh with hydration suspended for that subtree, so cursor-greedy
adoption (such as a keyed list's markerless item path) cannot claim the slot's
own close marker.
