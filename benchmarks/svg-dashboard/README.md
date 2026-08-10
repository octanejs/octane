# svg-dashboard bench

A hand-rolled-SVG observability dashboard (no d3 / recharts / visx — every
path, transform, and label string is built by first-party code), implemented
four times with byte-identical rendered DOM: `octane-tsrx`, `react` (19),
`solid` (2.0 beta), and `svelte` (5). It is the suite that stresses SVG
rendering and updates: static SVG structure is nearly free in octane (a
namespace-flagged template clone), so almost everything interesting lives in
the update paths this app churns.

## The app

One 1200×800 SVG document, Grafana-shaped (~2,400 elements at mount):

- **Topology map** — 150 service nodes (`<g transform>` with `rect`/`use
  href`/`circle` and, for ~120 nodes, a `<foreignObject>` HTML label), 200
  curved `<path d>` edges carrying style objects and `data-*` spread bags.
- **Charts strip** — 8 charts × 5 keyed series (`<path d>`, ~1.4 KB each, 120
  points), gradient-filled area series, keyed x/y axis ticks, keyed legend
  whose items are SVG `<a>` anchors, `<linearGradient>` defs with per-tick
  stop-opacity updates.
- **Sparklines** — 32 small `<path d>` + head-dot layers.
- **Icon layer** — 150 status icons built lucide-style from shared
  `[tag, attrs]` tuples at runtime (see "fairness ledger").
- **Tooltip overlay** — an empty `<g class="overlay">` as the topmost layer
  (SVG has no z-index); tooltips arrive by portal, the recharts ZIndexLayer
  pattern.

State lives in three domains (topology / charts / ui) driven by the shared
`ops.js`; every DOM-bound value is a final string produced there, so the
frameworks contribute only binding + reconciliation machinery.

## Ops (what a bad number points at)

| op | what it stresses in octane |
| --- | --- |
| `mount` | template clone + namespace flags; icon-layer `createElementNS`; foreignObject labels |
| `charts_tick` | prev-guarded generic `setAttribute` d-churn (incl. the per-write sanitize-url `toLowerCase` pair); gradient stops; tick/legend text |
| `tick_sparse` | the diff-skip walk: fresh snapshot objects, identical strings — no DOM writes should happen |
| `drag_nodes` | per-frame keyed-row updates: transforms + incident-edge `d` recompute |
| `pan_zoom` | per-commit overhead: 2 attribute writes per commit with all subtrees behind reference-stable descriptor props |
| `select_toggle` | `setClassAttr` (SVG class is attribute-only) across 350 rows |
| `topology_churn` | keyed LIS reconcile inside `<svg>`; runtime foreignObject insertion; teardown |
| `label_churn` | SVG→HTML namespace push/pop under runtime insert/remove |
| `tooltip_swarm` | portal into an SVG `<g>`, mount/move/unmount |
| `icon_swap` | the `createElement` de-opt reconciler: descriptor re-diff, tag swaps, plus `<use href>` fast-path writes |
| `series_toggle` | structural add/remove + y-domain rescale of surviving paths + keyed tick relabel |
| `style_spread_pulse` | style objects with unitless SVG props + `data-*` spread bags on 200 edges |

Op sizing: each timed body batches enough semantic repetition (ticks, frames,
cycles — never loop-and-divide) that every flavor's median clears ~1–1.5 ms;
below that, Chromium's 0.1 ms timer granularity dominates and the runner's
compare gate refuses to call a sub-ms move a regression. Batch sizes are the
constants at the top of `run.mjs`.

## Correctness gates (all untimed, all fatal)

1. `data.js`/`ops.js` md5-identical across the four fixtures.
2. **Node replay**: the harness imports the same shared ops module, replays
   the scripted gate sequence, and compares the DOM byte-for-byte — every
   series `d`, node/icon transform, class string, icon variant, style value,
   `data-flow`, viewBox, tooltip placement, and the id order after churn.
3. **Namespace census** at mount and after the sequence: every element is
   SVG-namespaced except foreignObject content (XHTML). A wrong-namespace
   `<path>` renders nothing and would look *faster*.
4. **Survivor identity** across keyed churn (`data-id` element-ref compare)
   and `class`-as-attribute proof (`className` must still be the read-only
   `SVGAnimatedString`).
5. **Cross-flavor DOM parity**: a canonical serialization (namespace, tag,
   sorted attributes with normalized `style`, per-element text) must hash
   identically across all four fixtures at mount AND after the sequence.
6. **Layout-read ban**: `getBBox`/`getBoundingClientRect` are instrumented
   during the gate pass; fixtures must position everything from data
   coordinates (a layout read inside the timed window would swamp samples
   with forced-layout cost).

Deterministic counters: `censusDomNodes` fields plus `svg_elements_full`,
`foreignobject_html_full`, `defs_full`; `elements_full` (2,404) is pinned 1.0
across flavors in `baselines/ratios.json`. `production_calls_tick` counts one
octane `__tick()` in a separate `--jitless` Chromium (15,449 at introduction)
with a hard ceiling in `run.mjs`.

Comment and whitespace/empty text nodes are **reported, never asserted
equal**: octane emits loop/portal markers (255 comments at mount), svelte
emits anchors (452 comments + empty text), react emits none.

## Fairness ledger

- **Icon layer asymmetry.** The icons are built at runtime from shared
  `[tag, attrs]` tuples — the literal mechanism each ecosystem's lucide
  binding uses: octane `createElement` (its *de-opt* reconciler,
  `packages/lucide/src/Icon.ts` shape), react `createElement` (its one and
  only path), solid `<Dynamic>`, svelte `<svelte:element>`. The `icon_swap`
  guard is a cliff-width tripwire for octane's descriptor path, not a win
  claim; solid/svelte have no compiled-template bypass being "turned off".
- **State machinery is idiomatic per flavor** over identical snapshots:
  octane slot-keyed `useState` + compiled prev-guards (ui state colocated in
  a `Viewport` leaf so pan/zoom commits don't re-walk the dashboard — the
  descriptor-prop analogue of react's memo isolation); react `useState` +
  `memo` on rows and domain sections, built through the production React
  Compiler like every primary React benchmark (see the repo README's React
  Compiler section); solid stores + `reconcile`-by-id
  (reconcile over fresh object graphs is Solid's documented worst case, as in
  the dbmon fixture); svelte `$state.raw` + keyed each blocks.
- **Solid cannot express two things declaratively** (both hand-rolled and
  load-bearing to know about): upstream `<Portal>` crashes under a `render()`
  root in the 2.0 beta (see `benchmarks/portal-swarm/solid/src/App.jsx`), and
  an `<a>`-rooted template compiles as an HTML anchor because Solid resolves
  namespaces at compile time and `a` is ambiguous — the legend anchor is
  built with `createElementNS` by hand. Octane resolves the same ambiguity at
  runtime (opaque-template path); react via fiber host context; svelte from
  markup position.
- **Class strings are pre-joined** in shared code (octane clsx-composes
  arrays; react coerces them to `"a,b"`), **style values are strings** (no
  flavor's px heuristics run; svelte uses `style:` directives), `<use>` links
  use SVG2 `href` (authoring `xlink:href` in solid/svelte is divergence-prone
  for zero DOM-visible benefit — the URL-sink sanitizer path still runs on
  `href`).
- **No real pointer events**: mutations enter through window hooks committed
  synchronously (`flushSync` / solid `flush()`); CDP mouse IPC costs ~10 ms
  per event and event dispatch is covered by the event-delegation and
  portal-swarm suites.

## Findings at introduction (2026-08-07)

Octane wins mount (0.82x react, 0.49x solid), per-commit overhead
(`pan_zoom` 0.32x react), SVG portals (`tooltip_swarm` 0.50x react), class
churn (0.58x solid) and even the de-opt icon flip (0.79x react). Known gaps
guarded as tripwires: `drag_nodes` 1.45x react (per-frame keyed-row walk
re-evaluates de-opt icon holes), `style_spread_pulse` 1.98x react (setSpread +
per-property style diff), `tick_sparse` ~1.8x solid/svelte (prev-guard walk
vs fine-grained skip — architectural).

## Running

```bash
node benchmarks/bench.mjs svg-dashboard            # via the unified runner
node benchmarks/bench.mjs svg-dashboard --quick
```

Standalone (servers first):

```bash
pnpm --filter octane-tsrx-svg-dashboard-bench preview   # :5302
pnpm --filter react-svg-dashboard-bench preview         # :5303
pnpm --filter solid-svg-dashboard-bench preview         # :5304
pnpm --filter svelte-svg-dashboard-bench preview        # :5305
node benchmarks/svg-dashboard/run.mjs 20
```

The comparative flavor set is octane/react/solid/svelte (no preact, ripple,
or vue-vapor): the suite needs one VDOM baseline, one fine-grained baseline,
and one compiled per-binding baseline — additional columns would quadruple a
four-implementation app for no additional coverage of octane internals.
