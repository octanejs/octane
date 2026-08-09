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

## Standing finding: the JSX dialect de-opts on navigation

The two Octane fixtures are the same app over the same core, authored twice. The
`.tsrx` fixture navigates entirely through compiled block bodies. The `.tsx`
fixture reaches the runtime de-opt renderer for the whole routed subtree:

| `nav_deep` | octane-tsrx | octane-jsx |
| --- | --- | --- |
| `renderBlock` | 5119 | 7169 |
| `createElement` | 0 | 4099 |
| `childSlot` | 0 | 4094 |
| `deoptItemBody` | 0 | 2046 |
| `hostElementBody` | 0 | 1023 |

That is 1.40× the block renders plus ~11k calls the `.tsrx` path never makes, and
it shows up in wall clock. A full run on 2026-08-07 (`node benchmarks/bench.mjs
spa-navigation`, medians in ms):

| op | octane-tsrx | octane-jsx | react | solid | vue-vapor |
| --- | --- | --- | --- | --- | --- |
| `nav_deep` | 2.60 | 8.60 | 1.80 | 2.20 | 3.10 |
| `nav_teardown` | 1.30 | 4.20 | 0.80 | 0.60 | 0.50 |
| `nav_mount` | 1.50 | 4.60 | 1.20 | 1.80 | 2.50 |
| `nav_nested` | 0.20 | 0.40 | 0.20 | 0.10 | 0.20 |
| `nav_deep_6x` | 16.80 | 58.40 | 12.20 | 15.00 | 20.70 |

`.tsx` costs 3.3× `.tsrx` on `nav_deep` and 3.5× under throttling, where it is
the difference between a navigation nobody notices and one everybody does.

Two other things that run tells us. Octane's `.tsrx` **mount** is the fastest of
the three fine-grained runtimes (`nav_mount` 1.50 against Solid 1.80 and Vue
Vapor 2.50), while its **teardown** is the slowest by a clear margin
(`nav_teardown` 1.30 against 0.60 and 0.50, standard deviations 0.08/0.06/0.17).
For deep trees the cost of a navigation sits in unmounting the outgoing route,
not in building the incoming one, and that is where the `.tsrx` gap is.

`nav_nested` is at the timer floor for every framework, so nothing should be read
into its ratios. The reuse ratios (0.04 to 0.09 against an ~0.03 floor) say no
framework here rebuilds the surviving shell, and the throttle ratios (6.5 to 7.2x
for all five) say none of them degrades disproportionately on a slow CPU: a phone
is slower because the work is bigger, not because the scheduling changes shape.

The `work.mjs` gates hold `.tsrx` at **zero** de-opt-renderer calls on every
navigation, and cap the `.tsx` counts so the gap cannot widen while it is being
addressed.

Note the repository's own website is authored entirely in `.tsrx`, so this
finding does not by itself explain slow navigations there; that needs its own
measurement against the real site.

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
