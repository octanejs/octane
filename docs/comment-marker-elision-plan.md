# Comment-Marker Elision Plan — fewer `<!--[-->`s when they carry no information

Status: M0-M5 LANDED (2026-07-13; see each phase's note). Follow-up to the
website Elements-panel report
(a 40-deep run of `<!--[-->` before `.shell`, ~2,100 comment nodes on the home
page). Companion to docs/compiled-output-optimization-plan.md — this is the
DOM-weight axis of the same verbosity problem.

## 1. Problem statement (measured 2026-07-09, website home page)

| Metric | Value |
| --- | --- |
| Comment nodes after hydration | **2,122** (1,996 steady-state after client nav — NO leak) |
| SSR block pairs | 196 open / 196 close, balanced |
| Consecutive opens before `.shell` | **40** (the router wrapper stack — one pair per layer) |
| Inside the recharts SVG | **~1,674** (`<g>` 1,268 · `<svg>` 222 · `<text>` 184) |
| Bench-table rows | ~110 |
| Truly empty `<!--[--><!--]-->` pairs | 6 |

Verdict from the investigation: **not a loop, not a leak** — every pair is one
block range (component slot / control-flow / child slot), minted once and
stable across navigation. But three structural sources make it heavy:

1. **Wrapper chains**: a component whose entire render is another component
   still costs a pair per layer. The router stack
   (`RouterProvider → Matches → MatchesInner → Provider → CatchBoundary → @if
   → Match → …` × route levels) = 40 nested pairs wrapping one element.
2. **De-opt child slots**: the `createElement`-descriptor path
   (@octanejs/recharts) nests a childSlot pair per component-bearing child —
   and component-bearing @for items carry BOTH their `<!--it-->` pair AND an
   inner childSlot pair.
3. **SSR always pairs**: the server emits every pair unconditionally and
   hydration adopts them unconditionally, so even where the CLIENT already
   elides (forBlock `singleRoot`), SSR'd pages keep every comment.

Cost: DOM memory, slower tree walks (the runtime's own range walks included),
and an unreadable Elements panel.

## 2. What markers are FOR (the invariants any elision must preserve)

From the 2026-07-09 runtime/SSR audit (line refs drift; names are stable):

- **Range ownership for teardown** — `unmountBlockInner` sweeps
  `startMarker…endMarker`; `exclusiveMarkers=false` removes the markers too
  (owned), `=true` sweeps only BETWEEN them (borrowed). Null markers on a
  non-root block = owns no DOM (removes nothing); null on a root block =
  owns the whole container.
- **Move/hide operations** — forBlock reorder (`moveBlockBefore`), tryBlock
  soft-detach/reattach, `<Activity>` hide all walk the marker range.
- **Insertion anchor for empty/replaced content** — an empty block's pair is
  where a later render inserts; branch swaps insert before the slot end.
- **Hydration cursor alignment** — the client adopts each server pair as the
  block's own markers (`isBlockOpen` → `matchingClose`); the hole-aware
  `child`/`sibling` walk treats a whole pair as ONE logical sibling.
  `matchingClose` is an UNBOUNDED scan — every adoption is `isBlockOpen`-
  guarded; new no-pair paths must keep that discipline.
- **Portal parent hops** — dispatch walks stamped children between the
  portal's own `<!--portal-->` pair.
- **Streaming reveal** — `$OCTRC` walks the balanced `[`/`]` range of a
  pending boundary to remove the fallback. **@try/Suspense pairs are
  load-bearing for streaming — excluded from elision.**
- **Seeds are NOT marker-coupled** — suspense seeds are consumed by ordinal
  `use()` call order; streaming per-boundary seeds are scoped by their own
  `<!--oct-seed:id-->` comment; `#__octane_data` is head metadata. Elision
  does not touch seeding.

## 3. Elision machinery that ALREADY exists (the design language)

The plan extends proven paths rather than inventing new invariants:

| Precedent | Mechanism |
| --- | --- |
| `componentSlotLite` | no Block, no markers at all (same-module hookless callees) |
| `componentSlot(…, singleRoot)` | mints nothing; after render the single root ELEMENT is promoted to `startMarker === endMarker`; suspend-safe via the `finally` promotion + null-marker no-op teardown; transitions PROBE off-screen instead of committing a marker-pair WIP |
| `renderBranchSlot` single-element branch | self-marks on the element; ALSO the borrowed-marker precedent: branch blocks reuse the slot's start/end with `exclusiveMarkers=true` |
| forBlock `singleRoot` items (flags bit 1) | per-item pairs skipped on fresh client mounts; item's one element is start=end=reorder anchor. Client-mount ONLY — hydration adopts server pairs regardless |
| childSlot lazy markers | lone-pure-host regime is fully anchorless; markers minted only when the value shape demands them (one-way promotion around the live node) |
| `childTextHole` | only-child primitives: zero slot state, zero comments, both sides |
| `renderToStaticMarkup` | `MARKERS=false` drops every pair wholesale (non-hydratable output) |

Also: the compiler already stamps `$$singleRoot = true` on hoisted fragment
renderers, and the runtime already reads that stamp for value-position
descriptors — the cross-module signaling channel exists.

## 4. Phases

### M0 — Measurement first (same doctrine as the size plan)

- **`comments_1k` op in the js-framework harness**: after the `run` op (1,000
  rows), count comment nodes in-page. Deterministic per framework → works
  with `--compare` AND cross-framework ratio guards (solid/ripple also use
  marker comments — honest comparison). Record baselines.
- **Website e2e ceilings**: assert per-route comment-count ceilings in
  `ssr-hydration.e2e.test.ts` (generous first — e.g. home ≤ 2,400 — ratchet
  down as phases land).
- **Structural pins**: a small marker-shape test that renders representative
  fixtures (wrapper chain, @for, de-opt tree) three ways — client mount, SSR
  string, hydrate — and asserts exact comment counts. Elision changes must
  edit these pins deliberately. (The differential rig STRIPS comments before
  comparing, so parity tests are blind to this by design.)

**M0 LANDED 2026-07-09.** Three layers, all green in both compile modes:

- `comments_1k` op in the js-framework harness (payload now carries every
  collected op). Recorded: **octane-tsrx 3 · octane-jsx 3 · react 0 ·
  ripple 0 · solid 0** — the 1,000-row grid is already almost marker-free
  (forBlock singleRoot at work), so this op is a singleRoot-regression
  TRIPWIRE (+1 comment fails the absolute compare), not a ratio (references
  are 0 — no ratio guard possible). The wrapper/de-opt weight lives in the
  ceilings + pins below.
- Website e2e per-route ceilings (CI-enforced): `/` ≤ 2,450 (measured 2,123)
  · `/docs` ≤ 450 (379) · `/benchmarks` ≤ 20,000 (**17,381** — the 12
  recharts cards; the M2 number) · `/playground` ≤ 250 (185).
- `tests/marker-shape.test.ts` + `_fixtures/marker-shape.tsrx`: exact
  client/SSR/hydrate counts for the five regimes. Measured surprises now
  pinned: same-module singleRoot ALREADY elides the Leaf layer of the chain
  (client 2 vs SSR 4); an @if with a single-element branch client-mounts with
  ONE comment total (slot rides the template `<!>` anchor, branch
  self-marks) vs SSR 4; empty-`@for` SSR emits only the outer pair while the
  client mints an empty-branch pair (client 5 / ssr 2 / hydrate 4); the
  de-opt tree hydrates to FEWER comments than SSR emitted (11 vs 14 —
  adoption discards some pairs while re-anchoring). These asymmetries are
  the baseline contract M1-M3 will edit deliberately.

### M1 — Cross-module `$$singleRoot` stamps (small, contained)

The compiler's `info.singleRoot` analysis (body renders exactly one plain
element) currently helps only same-module call sites. Extend:

- At the DEFINITION site, stamp exported qualifying components:
  `Comp.$$singleRoot = true` (precedent: fragment renderers).
- At runtime, `componentSlot` mount falls back to the singleRoot path when
  the compile-time arg wasn't passed but `comp.$$singleRoot === true`
  (one property read at mount; the descriptor path already does this).
- The `hmr()` wrapper must FORWARD the stamp (dev/prod parity — checked by
  the octane-prod project).
- `memo(Comp)`/`lazy` wrappers don't carry it → conservative miss, fine.

Wins: client-rendered subtrees everywhere (post-navigation route content, the
playground, client-only apps). Does NOT change SSR'd pages (adoption keeps
server pairs) — that's M3. Bindings shipping plain `.ts` (recharts) don't get
stamps — that's M2.

**M1 LANDED 2026-07-09.** The compiler stamps `Comp.$$singleRoot = true` on
every same-module component whose body renders one plain element (emitted at
the module tail, so it lands on the final binding incl. the hmr() wrapper);
call sites whose callee is an IMPORTED bare identifier (no key/spread/
children) emit a `2` sentinel and `componentSlot` resolves it against the
stamp at mount. **Sharp edge found by the suite:** the sentinel initially
fired for ANY unknown bare identifier — including per-render local variables
(`const Comp = cond ? A : B`), whose identity changes across renders while
the markerless regime is pinned at first mount (broke the transition-swap
probe test). Restricted to imported bindings (immutable identity). SSR and
hydration unchanged by design. Pinned by marker-shape case (a2): cross-module
sole child = client 0 / ssr 2 / hydrate 2. Website home steady-state client
render: 1,996 → **1,900** comments (−5% — as projected, M2/M3 carry the bulk).
Perf: same-session A/B neutral within noise.

### M2 — De-opt single-child anchoring (the 1,674-comment chart)

Runtime-dynamic (no compiler involvement), extending the lazy-marker regime:

- **hostElementBody children**: when the children value is a SINGLE
  descriptor, let the childSlot use the anchorless/self-marked regime even
  for component-bearing children whose render resolves to one element —
  promote to a minted pair only when the shape flips (the existing one-way
  promotion). Today only `pureHost` values qualify.
- **deoptItemBody component-bearing items**: the nested childSlot should
  BORROW the item block's existing range (`exclusiveMarkers=true` precedent)
  instead of minting a second inner pair.
- The website chart mounts client-side behind the hydration gate (BenchBars
  mounted-state), so M2's wins apply fully to the SSR'd home page.

Sharp edges: `clearChildContent`/reorder on self-marked slots (hostNode
tracking exists); kind-flips between regimes must keep the promotion one-way.

**M2 LANDED 2026-07-09** — as an OWNS-PARENT childSlot mode, stronger than the
single-descriptor sketch above:

- `ChildSlot.ownerHost`: a de-opt host (`hostElementBody` children,
  `renderHostTagChildren`, `hostComponent` — whose inner `<!---->` child
  anchor is gone entirely) hands its element to `childSlot`, which then owns
  ALL of the element's children — NO markers in ANY value regime (component,
  text, null), not just pureHost. Inserts append (null anchor); clears remove
  every child of the element (`clearChildContent`'s first branch, with the
  same blockless `detachDeoptTreeRefs` sweep as the marked path). One-way
  exceptions that still mint lazily, appended at the element tail: array mode
  (ForSlot anchors reconcileKeyed on a real pair). Owns-parent slots skip the
  off-screen transition swap (no `end` to commit at) and take the legacy
  swap, like singleRoot componentSlots. Hydration never enters the mode
  (server-pair adoption wins at mount).
- `deoptItemBody` component-bearing items: on client mount the nested
  childSlot BORROWS the item block's own `<!--it-->` pair as its range
  (pre-seeded slot state, the hydration-seed precedent) instead of minting an
  inner end-anchor + lazy start. The item block still owns the pair
  (inclusive teardown); `clearChildContent` sweeps between markers only.
- Pinned by marker-shape case (e): Deopt client 12 → **8**, hydrate 11 → **9**
  (SSR unchanged at 14 by design). Website (dev-SSR e2e measurement):
  `/` 2,030 → **1,783**, `/benchmarks` 17,381 → **14,793** — e2e ceilings
  ratcheted to 2,050 / 17,000 (~15% headroom).
- Validation: full suite green in both compile modes (octane + octane-prod
  projects), hydration suites, website dev+preview e2e. A brand-new lexical
  typeahead-menu port test flaked twice under full-suite load during the
  landing (real-timer `settle()` races) — it passes 20+ consecutive runs on
  both pre- and post-M2 runtimes in isolation and in its project; not an M2
  regression.
- Perf: same-session js-framework A/B neutral within noise (run/replace/
  runlots/clear marginally better, sub-ms ops at timer granularity); ratio
  guards pass.

### M3 — Inherited ranges for sole-child wrappers (the 40-chain) + SSR symmetry

The compile-time condition is exact: a construct that is the SOLE root of a
`noTemplate` body (host `== __block.parentNode`, anchored at
`__block.endMarker`) spans its parent block's ENTIRE range by construction.

- **Client**: pass an `inheritRange` flag → the slot/branch adopts the parent
  block's `startMarker`/`endMarker` with `exclusiveMarkers=true` (borrowed —
  the branch-block precedent) instead of minting. Recursion collapses a
  wrapper chain to the outermost pair. Root-block parents (null markers) put
  the slot in whole-container mode (root precedent).
  - Teardown: sweep-between on borrowed markers ✓ (parent's markers survive).
  - tryBlock detach / reorder of the PARENT moves the same nodes the child
    references ✓.
  - Identity remount: clear between borrowed markers, re-render in place
    (today it mints a fresh pair — the borrowed path skips that).
  - Transitions: inherited slots take the singleRoot-style PROBE path (a
    marker-pair WIP commit would change the parent's range shape).
- **Server**: the compiler emits pair-skipping variants at exactly the same
  statically-flagged sites — `ssrComponent` inline form (skip
  `renderComponentFramed`'s wrap), `ssrEmitIf/Switch` without the outer slot
  pair. Frames are still created (path keys/seed order unchanged — seeds are
  ordinal, §2).
- **Hydration**: symmetric by the same compiler flag — inherited sites adopt
  NOTHING (the parent's pair was already adopted). Server and client are
  compiled from the same analysis, so pair counts agree by construction —
  same mechanism that keeps if/switch/for nesting parity today.
- **Exclusions**: @try/Suspense ranges (streaming `$OCTRC` walks them),
  portals (foreign-target ownership), `<Activity>` (hide/show walks),
  keyed component slots (`key=` forces identity semantics on the range).

This is the biggest blast radius (three layers must agree) and lands LAST,
gated on the M0 pins + the full hydration/e2e/prod-mode suites.

**M3 LANDED 2026-07-09 — the sole-COMPONENT-root scope.** What shipped:

- **The predicate** (`inheritSoleCompRoot`, compile.js — shared verbatim by
  both compile modes so client stamp ↔ server pair-skip ↔ hydration
  adopt-nothing agree by construction): a `@{}` (JSXCodeBlock) body whose
  normalized, head-filtered output is exactly ONE component-tag root without
  `key=`. Identifier, member (`<ctx.Provider>` — the router/binding wrapper
  stack), and dynamic tags all qualify. Synthetic sub-bodies (@if/@for/@try
  arms, children render-fns — statement arrays) never do.
- **Client** (`componentSlot(..., inherit)`): borrows the parent block's
  marker pair with `exclusiveMarkers=true` (the branch-block precedent), or
  enters whole-container mode when the parent's markers are both null (root /
  owns-parent parents). Identity swaps sweep BETWEEN the borrowed markers and
  remount in place (multi-root replacement bodies included — singleRoot could
  never hold those); transitions take the singleRoot-style PROBE path (a wip
  pair commit would change the parent's range shape); the borrow declines to
  the normal regimes when the parent has no coherent range (LiteBlockImpl),
  and bodies containing an inherit root are stamped lite-INELIGIBLE as
  callees so the decline is unreachable under hydration.
- **Server** (`ssrComponent(..., inherit)` → `renderComponentFramed`): skips
  the `<!--[-->…<!--]-->` frame wrap (string-tag branch included); the FRAME
  itself is still created — use() path keys and seed order are unchanged.
- **Boundary builtins** (Suspense / ErrorBoundary / Activity): excluded at
  compile time by imported name, AND declined at RUNTIME by identity on both
  sides (componentSlot + ssrComponent check the resolved comp), which is what
  makes member/aliased/dynamic tags safe to stamp.
- **Hydration**: inherit sites adopt nothing (resolved before the cursor
  probes — probing would misread the child's own first marker); legacy
  pair-ful server HTML falls into mismatch RECOVERY and re-renders to correct
  content (pinned).
- **Divergence erased**: component-form ↔ bare-form of the same markup now
  serialize identically and cross-reconnect CLEAN — the
  hydration-mismatch conformance divergence pin (Reconnecting:76/:91) flipped
  to a React-parity pass.
- **Pins** (marker-shape): Chain 2/4/4 → **0/0/0**; ChainX 0/2/2 → **0/0/0**;
  keyed keeps 2/2/2; `<Ctx.Provider>` root 0/2/2; aliased-Suspense 6/8/8
  symmetric decline; swap-in-place both regimes; adoption-identity + recovery.
- **Website reality check** (dev-SSR e2e): `/` 1,783 → 1,743, `/benchmarks`
  14,793 → 14,447 — modest, and the profile explains it: the home page's
  weight is chart-INTERNAL client minting (~872 empty anchors + 382 `it`
  pairs inside the recharts SVG), not wrapper pairs (SSR pairs total 188; the
  40-deep root prefix is already 0). Ceilings ratcheted to 2,000 / 415 /
  16,600 / 195.
- **Perf**: same-session js-framework A/B neutral within noise (the one extra
  `inherit` check sits on the slot-mount cold path); ratio guards pass.

**M4 LANDED 2026-07-09 — the chart-internal weight (client-mount only, like
M2; SSR emission and hydration adoption untouched):**

- **Sole-child hole → owns-parent** (`childTextHole`'s object fallback,
  runtime.ts): a `{expr}` hole that is its element's SOLE child hands the
  element to the M2 owns-parent childSlot — component/element/array values
  render with NO anchor comment (arrays still mint their ForSlot pair
  lazily). One-line change; the sole-child invariant IS the ownerHost
  invariant. Primitive values were already markerless (`childTextHole`).
- **De-opt item self-marking** (`reconcileKeyed`'s `2` sentinel → resolved
  per item VALUE in `mountItem`): a pure single-element host-descriptor item
  self-marks — its rendered element is start === end (the forBlock-singleRoot
  regime) — so value-position `.map()` lists pay NO `<!--it-->` pair for
  pure items. Component-bearing / null / primitive items keep their pair.
  Two sharp edges handled: (1) a self-marked item whose value stops fitting
  one raw element (null / primitive / component) PROMOTES one-way to a pair
  minted around the current node in place (`deoptItemBody` — the keyed Map,
  reorder anchoring, and the M2 borrow all survive); (2) the pure-path
  rebuild now inserts-before-removing — the old element IS the end marker,
  so remove-first would detach the insert anchor (and the markers re-point
  to the replacement).
- Pins: Deopt client 8 → **4** (hole −2, item pair −2);
  `deopt-item-selfmark.test.ts` covers mount elision, reorder identity,
  tag-change rebuild, both promotion flips (component + positional-null),
  and teardown incl. the needs-blocks → pure whole-tree flip.
- Website (dev-SSR e2e): `/` 1,743 → **1,463**, `/benchmarks` 14,447 →
  **12,061**. Cumulative from the 2,122 / 17,381 start: **−31%** on both.
  Ceilings ratcheted to 1,680 / 415 / 13,800 / 195.

### M5 — Benchmark-fixture client ranges and a general DOM census

**M5 LANDED 2026-07-13.** This phase started from production builds of the
representative benchmark fixtures and counted every descendant of the fixture
root by `nodeType`. That separates user-visible elements/text from Octane's
comment bookkeeping and avoids treating another framework's whitespace text as
equivalent to a range marker.

| Fixture state | Octane before | Octane after | React / Preact | Visible elements/text |
| --- | ---: | ---: | ---: | --- |
| js-framework, 1,000 rows | 10,075 (3 comments) | **10,074 (2)** | 10,072 (0) | 8,051 / 2,021, exact |
| TodoMVC, 100 todos | 933 (310 comments) | **730 (107)** | 623 (0) | 517 / 106, exact |
| chat-stream, 10 messages / 21 segments | 158 (78 comments) | **104 (24)** | 80 (0) | 55 / 25, exact |
| portal-swarm, 600 closed cards | 3,826 (1,812 comments) | **2,622 (608)** | 2,014 (0) | 1,411 / 603, exact |
| portal-swarm, all portals open (whole body) | 8,229 (3,012 comments) | **7,025 (1,808)** | 5,217 (0) | 3,412 / 1,805, exact |

The same js-framework fixture authored through the generic return-JSX paths
lost its cliff: the naive TSRX variant went from 2,003 comments to **2**, and
the naive JSX variant from 4,003 to **2**, matching the tuned fixture's DOM
shape. Solid and Svelte are still reported separately by the harness because
their compiled output deliberately uses extra text/comment nodes in several
fixtures; element and meaningful-text equality is the semantic comparison.

The attribution and changes are deliberately narrow:

- `compile.js` (`makeForCall` + `planJsx`) now proves sole keyed-item roots for
  direct hosts, a component definition with exactly one unconditional host
  return, and an `@if/@else` whose every reachable arm is exactly one host.
  Imported components use the existing immutable `$$singleRoot` definition
  stamp. A missing branch, fragment, spread, children override, key, early
  return, or unknown/dynamic callee declines the optimization.
- `runtime.ts` (`forBlock`) reuses a compiler-owned trailing `<!>` as the
  list's closing marker, and an active `@empty` body borrows the list's outer
  range rather than nesting another pair. Hydration adopts the established
  server range unchanged.
- `runtime.ts` (`renderBranchSlot`) leaves an inactive client-only branch on
  its existing insertion anchor and re-enters the self-marked one-host regime
  when it becomes active. When a sole-root branch is also a keyed-item
  boundary, replacements update every exact borrower; an empty result or a
  transition commit promotes that shared boundary to one durable pair.
- `runtime.server.ts` / the compiler's SSR emitters were intentionally not
  changed. Hydratable HTML keeps the current balanced range protocol, and the
  client continues to adopt legacy/current server output. Eliminating server
  item ranges needs a versioned, symmetric SSR + hydration change and is not
  bundled into this low-risk client optimization.
- Portals keep their target-side pair (1,200 comments for 600 open portals),
  which is used for target ownership, event propagation, update insertion, and
  teardown. Suspense/`@try` streaming boundaries, transition WIP pairs,
  `<Activity>` ranges, multi-root keyed items, order-bearing value-hole
  anchors, and adjacent-text SSR separators also remain load-bearing.

`benchmarks/lib/dom-nodes.mjs` is the regression surface: js-framework,
TodoMVC, chat-stream, and portal-swarm now emit deterministic `nodes_*`,
`elements_*`, `text_*`, `comments_*`, `empty_text_*`, and
`whitespace_text_*` operations plus comment-payload/parent histograms in
`meta.dom`. Ratio guards cap total nodes while requiring Octane's visible
element/text counts to equal React's. Portal-swarm records both the fixture
root and whole-body census so target-side portal ranges cannot disappear from
the accounting.

The implementation plan was ordered by invariant risk: instrument first;
reuse already-owned anchors/ranges; extend the existing single-root proof;
then test keyed identity, state/effects/events/refs through the full suite,
branch replacement, transitions, SSR adoption, and mismatch recovery. The
SSR/hydration wire format and foreign-target/streaming boundaries stay a
separate follow-up. Normal production comparisons kept the affected work
competitive: js-framework `run` 1.8 ms vs React 6.5 / Solid 1.7; TodoMVC
`add100` 2.7 ms vs React 13.8 / Solid 2.1; chat `streamFine` 1.4 ms vs React
7.2 / Solid 3.2; portal mount/open 2.4/1.3 ms vs React 3.8/1.5. Fewer nodes
also shorten range walks and reduce DOM memory.

The exact size cost, measured against an isolated current-main worktree with
the same toolchain, is small but non-zero. The fixed codegen corpus grows
121,122 → 121,280 raw bytes, 63,229 → 63,337 minified, and 23,205 → 23,247
gzip (**+42 B / +0.18% gzip**). The js-framework production bundle grows
28,884 → 28,889 B gzip (+5 B); control-flow-heavy TodoMVC grows 28,972 →
29,115 (+143 B / +0.49%), and chat-stream 29,223 → 29,358 (+135 B / +0.46%).
That is the boundary-propagation/runtime proof cost paid by apps that use the
optimized paths; the matching js-framework, TodoMVC, and chat states lose 1,
203, and 54 live nodes respectively, while closed portal-swarm loses 1,204.

**Still open (small or order-constrained — diminishing returns):**

1. Multi-hole hosts: the remaining ~684 empty anchors on `/` are
   order-bearing (`<g>{a}{b}</g>` — siblings need stable positions); eliding
   them needs per-hole neighbor bookkeeping. Biggest remaining bucket.
2. Component-bearing `it` pairs (145 on `/`) — required borrow ranges today.
3. Sole-root `@switch` construct inherit + children-render-fn /
   value-position sole roots (M3 leftovers).
4. SSR-side symmetry for the M2/M4/M5 client regimes (hydrated pages keep
   server item/component pairs the client mount would not mint). This must be
   designed as one SSR-emission + hydration-adoption protocol change.

### Ordering & expected effect

M0 → M1 → M2 → M3 → M4 → M5. Home-page projection: M2 removes ~1,600 (chart + rows),
M3 removes ~39 of the 40-deep prefix and every wrapper pair page-wide
(≈300 of the 392 SSR-pair comments), M1 covers client-rendered leaves.
Target: **2,122 → under ~400**, root prefix 40 → ≤ 3.

## 5. Test & perf strategy

- Every phase: full suite (incl. octane-prod), hydration suites (adoption
  identity assertions catch silent rebuilds), the website e2e (mismatch
  warnings), and NEW M0 structural pins.
- Mismatch-recovery paths (`clone` divergence discard, forBlock item guards)
  must be re-exercised where adoption expectations change — add a
  server-has-pair/client-expects-none fixture per M3 construct.
- Perf: same-session A/B on js-framework/dbmon/effectful-list. Expected
  neutral-to-positive (fewer DOM nodes, shorter walks); the singleRoot item
  precedent showed no cost. Memory is where wins may show (dbmon).
- Ratchet: `comments_1k` guards + e2e ceilings tighten per phase.

## 6. Open questions

1. M5 now elides client-only inactive `@if` pairs and lets a guaranteed
   host-vs-host branch share a keyed-item boundary. General sole-root
   `@if`/`@switch` inheritance still needs a symmetric SSR/hydration design.
2. Should `mountItem` under hydration ALSO skip adopting per-item pairs when
   the server (post-M3 compiler) stopped emitting them for singleRoot @for
   bodies? Natural extension of M3's flag to `ssrEmitFor` — folds the last
   big pair population on SSR'd list pages. Proposal: yes, same mechanism,
   after M3 core proves out.
3. Empty branches still need one insertion anchor unless their position is
   recoverable from siblings. M5 removes the redundant pair but deliberately
   retains that single anchor.
