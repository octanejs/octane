# spa-navigation bench: octane (TSRX vs JSX) vs react vs solid vs vue-vapor

What a full-page client-side navigation actually costs: tearing down one route's
component tree and building the next one while the app shell stays mounted.
Where [`recursive-context`](../recursive-context/) measures updates *within* a
mounted tree and [`js-framework`](../js-framework/) measures wide keyed lists,
this suite measures the teardown/mount pair that a router triggers, the thing a
user feels as "the page took a while to come up".

Routers are deliberately **not** part of the fixtures. Every app holds one route
signal/state and swaps its outlet, so the numbers are renderer work rather than a
comparison of router libraries.

```bash
node benchmarks/bench.mjs spa-navigation
node benchmarks/bench.mjs --quick spa-navigation
```

## The app

One shell (`.shell` + `.nav`) around an outlet. Two top-level routes each render
a depth-10 binary tree (1024 leaves, 1023 interior nodes, ~2000 components), and
one nested route pair renders a depth-5 tree (32 leaves) inside a shared layout.

```
.shell
  .nav > .crumb
  .outlet[data-route]
    'a'    → .page[data-page=a]  → 1024 leaves
    'b'    → .page[data-page=b]  → 1024 leaves
    'a/x'  → .layout > .outlet-inner > .section[data-section=x] → 32 leaves
    'a/y'  → .layout > .outlet-inner > .section[data-section=y] → 32 leaves
```

## Ops

| op | navigation | work |
| --- | --- | --- |
| `nav_deep` | `a` → `b` | 1024-leaf teardown + 1024-leaf mount |
| `nav_teardown` | `a` → `a/x` | 1024-leaf teardown + 32-leaf mount |
| `nav_mount` | `a/x` → `a` | 32-leaf teardown + 1024-leaf mount |
| `nav_nested` | `a/x` → `a/y` | 32-leaf teardown + 32-leaf mount, shell **and** layout survive |
| `nav_deep_6x` | `a` → `b` | `nav_deep` under 6× CPU throttling |

`nav_teardown` and `nav_mount` exist so teardown and mount can be read apart
instead of only in sum, because a framework can be fine at one and poor at the other.

`nav_nested` is the reuse probe: only the innermost 32 of 1024 leaves change, so
a framework that reuses the surviving wrappers does roughly 3% of `nav_deep`'s
work. The harness prints that as a **reuse ratio** (`nav_nested / nav_deep`,
ideal ~0.03).

`nav_deep_6x` is the mobile signal. A navigation that is comfortable on a laptop
can be visibly slow on a phone, and the **throttle ratio** says how CPU-bound the
navigation is.

## Why these numbers are actionable

The semantic gate is fatal and runs before any timing. It asserts leaf counts and
paths per route, that the outgoing route is really gone, and (the load-bearing
part) that the shell survives **every** navigation and the layout survives the
nested one **by node identity**, not by markup equality. A framework cannot score
well by skipping the work: if it rebuilt the shell, the gate fails.

`work.mjs` is the deterministic companion. It reads Chromium precise call
coverage over the production bundles for both Octane dialects, so a regression
gets a name rather than a number: whether a route swap ran through compiled block
bodies or fell back to the runtime de-opt renderer (`createElement` / `childSlot`
/ `deoptItemBody` / `reconcileKeyed`), and how much of the surviving shell was
rebuilt.

## Resolved finding: the JSX dialect no longer de-opts on navigation

The two Octane fixtures are the same app over the same core, authored twice.
When this suite landed (2026-08-07), the `.tsx` fixture reached the runtime
de-opt renderer for the whole routed subtree — 4099 `createElement`, 4094
`childSlot`, 2046 `deoptItemBody`, 1023 `hostElementBody` per `nav_deep`, 3.3×
the `.tsrx` wall clock — and `.tsrx` teardown was the slowest of the
fine-grained runtimes (2.2× solid) because every block detached its own DOM
range node-by-node.

Both causes are fixed: unmount teardown removes a deleted subtree's DOM once at
the outermost detached block, and the compiler lowers conditional JSX returns
(`if (c) return <A/>; return <B/>`) to the same template control flow as
`@if`/`@else`. The recursive `Node` — the whole routed tree — now renders
through `componentSlotVoid` arms with **zero** de-opt-renderer calls in either
dialect. A full run on 2026-08-09 (`node benchmarks/bench.mjs spa-navigation`,
medians in ms):

| op | octane-tsrx | octane-jsx | react | solid | vue-vapor |
| --- | --- | --- | --- | --- | --- |
| `nav_deep` | 1.80 | 2.10 | 1.70 | 2.00 | 2.90 |
| `nav_teardown` | 0.60 | 0.60 | 0.80 | 0.60 | 0.80 |
| `nav_mount` | 1.40 | 1.60 | 1.10 | 1.50 | 2.20 |
| `nav_nested` | 0.10 | 0.10 | 0.10 | 0.10 | 0.20 |
| `nav_deep_6x` | 12.20 | 13.60 | 11.50 | 14.00 | 19.40 |

Both dialects now beat Solid on `nav_deep` and tie it on teardown. The residual
`.tsx` gap (renderBlock 6147 vs 5119, createElement 1029 vs 0) is the
single-return `_frag` wrapper ABI — one extra block and descriptor per
component — which is the next lowering target.

`nav_nested` is at the timer floor for every framework, so nothing should be read
into its ratios. The reuse ratios say no framework here rebuilds the surviving
shell, and the throttle ratios (~6.5-7x for all five) say none of them degrades
disproportionately on a slow CPU: a phone is slower because the work is bigger,
not because the scheduling changes shape.

The `work.mjs` gates hold BOTH dialects at **zero** de-opt-renderer calls on
every navigation, and `benchmarks/baselines/ratios.json` guards `nav_teardown`,
`nav_deep`, and `nav_mount` against solid so neither fix can silently regress.

## Fixtures

| dir | port | notes |
| --- | --- | --- |
| `octane-tsrx/` | 5310 | directive syntax (`@if`/`@switch`, `class`) |
| `octane-jsx/` | 5311 | same app, React-style `.tsx`, same octane core |
| `react/` | 5312 | React 19, `flushSync` per navigation |
| `solid/` | 5313 | Solid 2.0, `flush()` per navigation |
| `vue-vapor/` | 5314 | Vue 3.6 Vapor, returns `nextTick()` (no public sync flush) |

Each op mutates the DOM inside its adapter call, synchronously where the
framework allows it; vue-vapor's returned thenable extends the timed window until
its microtask flush lands, because that hop is Vue's own scheduling cost. GC is
forced before every timed sample. This times framework JS work, not pixels on
screen.

The Solid and Vue fixtures switch the outer route on a memo/computed of the
**top-level segment** so the nested layout survives `a/x` → `a/y`, which is what a
real router does by matching per segment and what reconciliation gives the VDOM
fixtures for free when the outlet returns the same component in the same
position.
