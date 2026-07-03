# js-framework naive fixtures — the de-opt authoring cliff

Three additional octane fixtures for the [js-framework suite](./README.md) that
render the SAME app with the SAME DOM/button contract as the tuned fixtures —
but authored the way real-world code actually arrives, so the rows land off the
compiled-template fast path. **The headline metric is the intra-octane
naive/tuned ratio per op** — how much octane's authoring cliff costs. React has
no such split (React IS createElement-authored, and its fixture is already
written the natural way), so react-vs-octane ratios in `run.mjs` understate
what naively-authored octane code pays; these fixtures make that cost a
first-class, regression-guarded number.

## Fixtures

| fixture             | port | package                   | authoring shape                                                                 |
| ------------------- | ---- | ------------------------- | ------------------------------------------------------------------------------- |
| `octane-tsrx-naive` | 5213 | `octane-tsrx-naive-jsbench` | `.tsrx`, but React-dev style: cross-module `<Row/>` per row, `<tr {...spread}>`, member-callee handlers via an imported `actions` object, value-dependent inline style object on a cell |
| `octane-jsx-naive`  | 5214 | `octane-jsx-naive-jsbench`  | same app in `.tsx` — JS control flow only (`items.map`, ternaries) + the same Row |
| `octane-ts`         | 5215 | `octane-ts-jsbench`         | PURE plain-`.ts` `createElement` — zero compiler involvement for the tree; the shape every `@octanejs/*` binding produces |

(The dbmon counterpart — the exact dbmon workload in plain-`.ts` `createElement`
on port 5209 — lives at [`../dbmon/octane-deopt/`](../dbmon/octane-deopt/README.md).)

Each fixture bundles several cliffs at once (component-per-row boundary, spread
diffing, non-bundled handlers, style-object diffing, full descriptor
reconciliation). Ablation variants isolating each contributor are documented
follow-ups, not part of this suite; handler-shape isolation specifically is
ceded to a future event-dispatch-storm suite.

## What each cliff costs (which fix a bad number points at)

- **cross-module `Row` component per row** (`*-naive`): every row is a
  `componentSlot` Block — per-row comment anchors, per-row scope allocation,
  per-row props objects — instead of a template-cloned `<tr>` inside the
  parent's `forBlock` body. Regressions point at componentSlot / Block
  mount+re-render overhead.
- **`<tr {...rowAttrs}>`**: a fresh spread object per render routes the row's
  attributes through the generic `setSpread` diff instead of compiled
  per-binding writes.
- **member-callee handlers** (`onClick={() => actions.select(id)}` with
  `actions` imported): the event-bundle transform only fires for
  identifier-callee arrows, so every row re-render reassigns its `$$click`
  slots.
- **inline style objects** (value-dependent, so they can't be folded into the
  static template): fresh object identity per render forces `setStyle`'s
  key-walk diff.
- **`octane-ts` / plain createElement**: everything above plus the whole tree is
  a fresh descriptor graph per render, reconciled by the runtime de-opt path
  (`childSlot` → `reconcileDeoptNode`/`reconcileDeoptChildren` keyed matching +
  `patchDeoptProps` prop loops). Regressions point at the de-opt reconciler —
  the path every `@octanejs/*` binding lives on.

## Running

The fixtures implement the full button contract (the six krausest buttons, the
per-row select/remove anchors, and the keyed-reorder matrix buttons), so the
existing harnesses drive them unchanged via the `TARGETS` env:

```bash
# servers (dev shown; swap for build && preview for production numbers)
pnpm --filter octane-tsrx-jsbench dev &        # :5176 (tuned baseline)
pnpm --filter octane-tsrx-naive-jsbench dev &  # :5213
pnpm --filter octane-jsx-naive-jsbench dev &   # :5214
pnpm --filter octane-ts-jsbench dev &          # :5215

TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5176/","ready":"#run"},
          {"name":"octane-tsrx-naive","url":"http://localhost:5213/","ready":"#run"},
          {"name":"octane-jsx-naive","url":"http://localhost:5214/","ready":"#run"},
          {"name":"octane-ts","url":"http://localhost:5215/","ready":"#run"}]' \
  node run.mjs
```

The first target is the ratio baseline, so putting the tuned fixture first
makes every printed ratio a naive/tuned cliff number directly.

The naive fixtures also carry the keyed-reorder buttons (mirroring the tuned
set), so `run-reorder.mjs` can drive them the same way — but the canonical
keyed-reorder comparison and its documentation target the TUNED fixtures;
treat naive reorder numbers as supplementary cliff data.

## De-opt assertion — `verify-deopt.mjs` (mandatory gate)

A naive fixture that silently lands back on the fast path would make the ratio
meaningless, so [`verify-deopt.mjs`](./verify-deopt.mjs) proves each naive
fixture is genuinely off it, using DOM-observable runtime artifacts (grepped
out of `packages/octane/src/runtime.ts`):

- **symbol signature** — de-opt-built host elements carry a
  `Symbol('octane.deoptDesc')` expando (the descriptor stash the de-opt
  reconciler diffs against); template clones never do. Fires for `octane-ts`
  and dbmon's `octane-deopt`.
- **comment signature** — component-per-row fixtures bracket every row with
  comment anchors (`componentSlot`'s `<!--comp-->` pair + the keyed item's
  markers) inside `<tbody>`, while the tuned single-root fast path is
  marker-free per item (only the list's own `<!--for-->` pair). Fires for
  `octane-tsrx-naive` / `octane-jsx-naive`.

Either signature passing (with the tuned twin clean on both) proves the de-opt;
the script reports which one fired. It ALSO asserts the rendered rows are
byte-identical tuned-vs-naive after `#run`, a select, `#update`, and
`#swaprows` — with `Math.random` replaced by the same seeded stream on both
pages so labels match, and with three documented normalizations: comment nodes
stripped (they ARE the artifact), the naive-only `style="…"` attribute stripped
(its presence is asserted separately on every row), empty `class=""` dropped,
and inter-tag whitespace collapsed.

```bash
node verify-deopt.mjs                 # all four pairs on the default ports
node verify-deopt.mjs jsf http://localhost:5176/ http://localhost:5215/
node verify-deopt.mjs dbmon http://localhost:5196/ http://localhost:5209/
```

Exits non-zero on any failure. Servers must be running first.

## Caveats / bias notes

- Row labels use `Math.random()` (matching the tuned fixtures), so timed runs
  render different label strings per target — statistically identical work, but
  not byte-identical DOM outside `verify-deopt.mjs`'s seeded runs.
- The two `*-naive` fixtures still compile their templates — the cliff they
  measure is componentSlot/spread/handler/style shape, not descriptor
  reconciliation. Only `octane-ts` (and dbmon's `octane-deopt`) measure the
  full runtime de-opt reconciler.
- `octane-ts` still needs the `octane()` vite plugin for the plain-`.ts`
  hook-slotting pass (`useState` needs a per-call-site slot symbol); the
  descriptor tree itself has zero compiler involvement.
- Production comparisons should use `build && preview` on BOTH sides — dev-mode
  numbers include unminified runtime + vite transforms.
