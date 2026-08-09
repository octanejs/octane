---
'octane': patch
---

Make transported commit payloads proportional to change size, not tree size.

On a transported root (Lynx's dual-thread renderer, any process split), every
object-valued host prop is re-encoded through the wire clone on every render,
so the identity-based prop diff could never certify sameness: a single-row
select over a 10,000-row table shipped a ~2.4MB commit of ~30,000 commands —
one spurious `update` for every row's freshly rebuilt class array plus two
`event` re-binds per row — identical in size to a commit where every tenth
row actually changed. Three cuts fix it:

- The prop diff now uses `sameUniversalHostPropValue`, an exported,
  depth-limited structural equality over the value semantics the wire itself
  preserves: primitives by `Object.is`, arrays and plain records (from any
  realm, via the universal-side `hasCrossRealmPlainPrototype`) element-by-
  element to depth 2, everything deeper or exotic by identity. Equal values
  emit no command, and `cloneSerializableValue` accepts cross-realm plain
  objects through the same predicate.
- The universal compiler lowers `class={[…]}` arrays whose elements are
  statically string-or-falsy to their clsx-composed string expression (an
  all-literal array folds to a static plan prop), and folds string-literal
  expression children and literal attribute values into the frozen plan, so
  the hottest per-row slot values are primitives instead of fresh
  allocations.
- A re-created but equivalent event handler closure no longer re-announces
  its listener on the wire: the listener ID is stable and the background
  dispatch table always rebinds to the newest closure, so only a new
  listener, a priority change, or an owner change emits a command. Host
  callbacks (attach) keep closure-identity announcement — their re-run on
  handler replacement is an observable contract.

The same select commit now carries 2 commands / ~225 bytes at any table
size, and update-every-10th carries exactly one text update per changed row
(the `lynx-table` ratio guards tighten from 1500× the changed-rows floor to
1.0×). The "renders scheduled while a commit awaits acknowledgement coalesce
into one commit carrying the latest state, intermediate states never cross"
transport behavior is now a tested contract — it previously held only as a
side effect of acknowledgement timing, and becomes load-bearing for storm
throughput once commits stop saturating the main thread.
