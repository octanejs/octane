---
"octane": patch
---

Compile `{items.map(item => <jsx key={…}/>)}` keyed lists to the same `forBlock`
fast path as `@for`, instead of the de-opt descriptor/childSlot path.

A React-style `.tsx` `.map(...)` (and a `.tsx`/`.tsrx` `.map` written in value
position) previously built a `createElement(...)` descriptor for every row on
every render and reconciled that array through `childSlot`/`reconcileKeyed`. It
now lowers — on both the client (`forBlock`) and the server (`ssrBlock`) — to a
compiled per-item body run over the raw items array, with the `key={…}` attribute
becoming the keyed reconciler's key function. The eager per-row descriptor
allocation is gone, the row body diffs per-binding, and server + client emit
matching markers so the list hydrates by adoption.

Lowered when the callback is an expression-body arrow returning a single JSX
element: `xs.map((item) => <el key={…}>…)` and `xs.map((item, index) => …)`
(destructured item params and the index param are supported). A block-body arrow,
a fragment/non-element return, or a non-arrow callback keep the previous childSlot
path. No authoring change and no behavioral change — keyed reconcile identity and
DOM-resident state are preserved (covered by new `.tsx` `.map` reorder + hydration
tests); it's a substantial update-throughput win for keyed lists authored with
`.map` (e.g. the dbmon benchmark's full-table tick roughly halved).
