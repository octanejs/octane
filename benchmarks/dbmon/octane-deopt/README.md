# dbmon octane-deopt — the createElement authoring cliff

The EXACT [dbmon workload](../README.md) (same `src/data.js` + `src/ops.js`,
copied verbatim from `../octane-tsrx/src`, so every frame renders byte-identical
rows) authored in **plain `.ts` `createElement`** — no `.tsrx`, no `.tsx`, no
compiled templates. It exposes the same
`window.__mount/__tick/__tickPartial/__remount/__sort/__unmount/__reset`
contract as the tuned fixture, so `../run.mjs` drives it unchanged via the
`TARGETS` env.

## What it measures

The compiled `.tsrx` twin renders rows via template-clone + `forBlock` (keyed
fast path, per-binding targeted updates). This fixture's component returns a
fresh `createElement` descriptor tree every render — the shape every
`@octanejs/*` binding produces — so the whole table goes through the runtime
**de-opt reconciler** instead:

- `childSlot` pure-host path → `reconcileDeoptNode` / `reconcileDeoptChildren`
  (keyed row matching against the live DOM),
- `patchDeoptProps` per-prop diff loops on every cell,
- `DEOPT_DESC` expando stash/lookup per element,
- full descriptor-tree allocation per tick (1000 rows × 7 cells).

**The headline number is the intra-octane `octane-deopt / octane-tsrx` ratio
per op.** React has no such split — React IS createElement-authored — so
react-vs-octane ratios in the main suite understate what naively-authored
octane code pays; this fixture makes that cost a first-class measurement. A
regression here points at the de-opt reconciler (keyed matching, prop diffing,
descriptor flattening), not at the compiler.

## Running

```bash
pnpm --filter octane-deopt-dbmon-bench build && pnpm --filter octane-deopt-dbmon-bench preview &   # :5209
pnpm --filter octane-tsrx-dbmon-bench  build && pnpm --filter octane-tsrx-dbmon-bench  preview &   # :5196

TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5196/"},
          {"name":"octane-deopt","url":"http://localhost:5209/"}]' \
  node ../run.mjs
```

## De-opt assertion (mandatory gate)

`../../js-framework/verify-deopt.mjs` proves this fixture is genuinely OFF the
template fast path (and not silently compiled): every de-opt-rendered host
element carries the runtime's `Symbol('octane.deoptDesc')` expando (the
descriptor stash `reconcileDeoptNode` uses to diff), which template-cloned
elements never have — and the tuned twin's `<tbody>` carries `forBlock`'s
`<!--for-->` comment anchors while the marker-free de-opt path has none. The
script also asserts the rendered table HTML is byte-identical tuned-vs-naive
(comment nodes stripped) after mount, a tick, and a sort:

```bash
node ../../js-framework/verify-deopt.mjs dbmon http://localhost:5196/ http://localhost:5209/
```

## Caveats

- The vite config keeps the `octane()` plugin — not for templates (there are
  none) but for the plain-`.ts` hook-slotting pass (`useState` needs a slot
  symbol). Row construction and reconciliation have zero compiler involvement.
- This fixture bundles the whole cliff (descriptor allocation + de-opt
  reconcile + prop diff). Ablation variants isolating each contributor are
  documented follow-ups, not part of this suite.
