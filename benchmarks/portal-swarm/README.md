# portal-swarm bench — octane vs react vs solid

A sibling of [`js-framework`](../js-framework/), [`dbmon`](../dbmon/),
[`recursive-context`](../recursive-context/) and
[`signal-favoring`](../signal-favoring/). Those suites never open a portal;
**portal-swarm isolates portal performance**: a 200-item list where every item
conditionally portals a 3-element tooltip (`div.tip > span.tip-label +
button.tip-btn`) into a foreign target — the tooltip/popover/menu swarm shape
every design system produces (and the exact shape the `@octanejs` bindings —
Radix, floating-ui, lexical — lean on).

The octane subsystems on trial, none of which any other bench touches:

- **`renderPortalState`** — portal mount, re-render-in-place, and the
  `$$portalParent` restamp loop over the portal's children on every re-render.
- **`registerDelegationTarget` refcounting** — each portal target needs the
  delegated event listeners attached; a shared target absorbs all but the first
  attach, distinct targets pay the loop per target.
- **The `$$portalParent` bubble hop** — event dispatch from inside a portal
  jumps to the logical parent instead of the DOM ancestors.
- **Portal teardown** — `teardownPortalState` + listener release on close.

A bad number points at exactly one of those: `open_all`/`open_close_cycle` →
portal mount/teardown, `rerender_open_*` → the re-render + restamp path (and
whether the stable-descriptor bail works), `open_close_distinct` vs
`open_close_cycle` → the per-target listener attach loop,
`dispatch_through_portal` → the bubble hop.

## Layout

```
benchmarks/portal-swarm/
├── octane-tsrx/   # Vite app, dev :5210 — octane authored in .tsrx (+ a plain-.ts portal helper)
├── react/         # Vite app, dev :5211 (React 19, production mode)
├── solid/         # Vite app, dev :5212 (Solid 2.0, hand-rolled portal — see caveats)
├── run.mjs        # Playwright harness — gates + timings
├── package.json   # umbrella: `pnpm bench`
└── README.md
```

## Shape

Each app renders the SAME 200 seeded items (mulberry32 — byte-identical labels
everywhere) three times, covering octane's two portal entry points plus a bail
probe. Each section owns its `open` / `tick` / `distinct` state so the harness
can re-render one section at a time and attribute costs cleanly:

- **Section A — compiled child position.** In `.tsrx`,
  `{createPortal(() => @{ … }, target)}` sits directly at JSX child position;
  the compiler lowers it to the `portal()` runtime fast path (no descriptor
  allocation). (Note: the body must be the arrow `() => @{ … }` sub-template
  form — inline host-element JSX as the body is not lowered at child position
  today.)
- **Section B — value position, the bindings shape.** A plain-`.ts` helper
  (`src/tips.ts`, no compiler involvement) builds
  `createPortal(createElement(…), target)` **descriptors** that reach the DOM
  through a `{expr}` children hole — the childSlot arm, exactly what
  `@octanejs/radix`'s `Portal` produces.
- **Section B_stable** — section B with module-level **reference-stable**
  descriptors (children + props identity never changes across re-renders).
  Probes whether any bail path exists for unchanged portals. The React twin is
  a cached ReactPortal element (React bails on element identity).

Targets: shared mode portals everything into `document.body`; **distinct mode**
retargets each item to its own container div (`.pt`, 200 of them, rendered by
the fixture itself), forcing the per-target listener attach loop that the
shared-target refcount otherwise absorbs.

For **React** the A/B distinction collapses (both sections produce
`ReactDOM.createPortal` elements through the same reconciler path) — the split
is kept so the apps stay structurally identical. For **Solid** all three
collapse (a portal is its only mechanism), and its fine-grained model means
`rerender_open_*` updates one text node without touching portals — that
near-zero IS Solid's honest number for the op, not a fixture bug. The Solid
fixture hand-rolls its portal because `@solidjs/web@2.0.0-beta.14`'s built-in
`<Portal>` crashes under a `render()` root — see caveats. **Ripple is omitted**:
its portal support is unverified.

## Ops

| op                        | what it stresses                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `mount_closed`            | full app mount (600 rows + 200 containers), zero portals                            |
| `open_all`                | 0 → 600 open portals in one flush (portal mount at swarm scale)                     |
| `rerender_open_A`         | bump section A's unrelated tick with its 200 compiled portals open (×10, /10)       |
| `rerender_open_B`         | same for the 200 value-position descriptor portals (rebuilt every render)           |
| `rerender_open_B_stable`  | same with reference-stable descriptors — the bail-path probe                        |
| `open_close_cycle`        | 5× (open all 600 + close all 600), /5 — shared body target                          |
| `open_close_distinct`     | the same cycle with 200 distinct container targets — the listener attach loop       |
| `dispatch_through_portal` | 200 in-page clicks on buttons INSIDE open portals, /200 — the bubble-hop dispatch   |

`dispatch_through_portal` handlers only bump a `window.__hits` counter — **no
setState** — so the timed window is pure event dispatch (delegation lookup +
portal bubble hop) with discrete-flush work excluded. All ops commit
synchronously (octane/react `flushSync`, solid `flush()`), GC is forced before
every sample, and sub-ms ops loop-and-divide.

The harness also prints a `distinct/shared` cycle ratio (the per-target attach
cost) and a `B_stable/B` rerender ratio (lower = the unchanged-portal bail
works).

## Correctness gates

Before any timing, an untimed verification pass hard-gates each target: row /
container / tip counts, the 3-element tooltip shape, shared-mode tips all in
`document.body`, distinct-mode tips exactly 3 per container with zero body
leaks, full teardown on close, tick-advance with portals surviving, and
click-through hit counting. Cheap per-sample gates run inside every timed loop
(tip counts, `__hits` delta of exactly 200). Any failure exits 1; with
`BENCH_JSON` set the failure reason is recorded in the JSON.

## Running

Start the three preview servers (production builds), then run the harness:

```bash
# build + preview each (production); run from the repo root
pnpm --filter octane-tsrx-portal-swarm-bench build && pnpm --filter octane-tsrx-portal-swarm-bench preview &
pnpm --filter react-portal-swarm-bench       build && pnpm --filter react-portal-swarm-bench       preview &
pnpm --filter solid-portal-swarm-bench       build && pnpm --filter solid-portal-swarm-bench       preview &

# then, from benchmarks/portal-swarm:
pnpm bench           # 20 timed iterations (+5 warmup) per op
pnpm bench:long      # 40 iterations
node run.mjs 3       # reduced-iteration smoke pass
BENCH_JSON=out.json pnpm bench   # also write machine-readable results
```

Swap `build && … preview` for `dev` to measure the unminified dev build. Set
`TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5210/"}]'` to run a
single adapter. The FIRST target in `TARGETS` is the ratio baseline.

## Caveats / bias notes

- **Solid `<Portal>` bug (suspected, `@solidjs/web@2.0.0-beta.14`).** The
  built-in `<Portal>` throws `Failed to execute 'contains' on 'Node': parameter
  1 is not of type 'Node'` for ANY portal under a `render()` root (reproduced
  with a single portal). `render$1` always registers the root (`#main`) as a
  delegated root (`web.js:179`); `Portal` then calls `ownerRoot.contains(m)`
  (`web.js:854-856`) where `m` is a `Proxy`-wrapped mount node
  (`createElementProxy`, `web.js:889`), and native `Node.contains` rejects a
  Proxy. This is structural, not a fixture shape issue. The Solid fixture
  therefore hand-rolls the portal — the standard userland Solid pattern (create
  the tooltip node, `appendChild` into the mount, `onCleanup` removes it) — which
  inserts children directly into the mount (no wrapper div), so tooltip DOM
  matches the other fixtures. Because the tooltip lives OUTSIDE `#main`, Solid's
  delegated `onClick` would never reach it (and `on:click` did not attach a
  listener in this build), so the button gets a direct `addEventListener('click',
  hit)`. Net effect: Solid's `dispatch_through_portal` measures a plain native
  listener rather than a delegated-container hop — its column should be read as a
  best-case floor for that op, not an apples-to-apples delegation number.
- `rerender_open_*` is a hooks-vs-fine-grained comparison as much as a portal
  one: solid updates one text node and never touches open portals. The
  octane-vs-react ratio is the portal-relevant signal there.
- `open_close_cycle` toggles via each section's `open` state (conditional
  mount/unmount of the portal), not by moving portals between targets —
  `distinct` is only ever flipped while everything is closed.
- React attaches its listener set to every portal container
  (`listenToAllSupportedEvents`) much as octane refcounts
  `registerDelegationTarget`s, so `open_close_distinct` is a fair three-way op.
