---
'octane': patch
---

Derived values are now cached at their declaration. A `const` whose initializer
performs a call during render — where every such call is a value projection by
the rule automatic memoization already uses — is lowered to a compiler-owned
memo keyed on the component locals it reads, so its identity is stable until
those inputs change.

This is what makes region memoization worth having. A region keys on the
identity of what it renders, so a derived value rebuilt on every render defeats
its cache unconditionally: memo-wall's value-position wall rebuilt 1,000
descriptors through `buildValueRows(items)` on every parent re-render, and that
call alone was 35% of the operation's CPU profile.

A calculation is admitted on exactly the callee rule that governs regions, so
the two agree. A member call is not cached even when its result is named:
`virtualizer.getVirtualItems()` moves with scroll while the virtualizer instance
stays put, and caching it froze a virtualized list mid-scroll. That also means
`const visible = todos.filter(...)` stays uncached — a genuine miss, since
`todos` really is an immutable snapshot, but this analysis cannot yet tell an
immutable receiver from a live one. Wrap it in `useMemo` yourself when the
identity matters; recovering it automatically needs receiver provenance and is
left as follow-up.

Also never cached: hook calls (recognised by naming convention, including
React's `unstable_use*` staging prefix — a cache around a hook freezes its state
cell and any subscription it owns), `let` declarations, which stay the escape
hatch for a value that must recompute every render, and calculations the render
tree never reads. Server compiles are untouched, since a server render evaluates
each body once.

Measured on `benchmarks/memo-wall`, paired runs against a baseline recorded
before any edit:

  parent_rerender_equal_B  0.226ms → 0.091ms  (−60%)
  one_change_B             0.235ms → 0.156ms  (−34%)
  ctx_through_wall_B       0.569ms → 0.413ms  (−27%)

That is the `createElement`-descriptors-through-a-children-hole shape every
`@octanejs/*` binding produces. `todomvc`, `chat-stream` and `js-framework`
compile byte-identically with and without this change and are reported as
controls only — their run-to-run movement (up to ±100% on sub-millisecond
operations) is the noise floor, not a result.

Compiled output grows 0.07% gzip on the `codegen-size` corpus.
