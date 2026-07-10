# Comment-Marker Elision Plan — fewer `<!--[-->`s when they carry no information

Status: M0 + M1 LANDED (2026-07-09); M2-M3 proposed. Follow-up to the website Elements-panel report
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

### Ordering & expected effect

M0 → M1 → M2 → M3. Home-page projection: M2 removes ~1,600 (chart + rows),
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

1. M3 for `@if` branch pairs too (slot pair inherits, branch pair remains as
   the swap range) — or both when the branch is also sole-child? Proposal:
   slot pair only in v1; branch pairs carry swap semantics.
2. Should `mountItem` under hydration ALSO skip adopting per-item pairs when
   the server (post-M3 compiler) stopped emitting them for singleRoot @for
   bodies? Natural extension of M3's flag to `ssrEmitFor` — folds the last
   big pair population on SSR'd list pages. Proposal: yes, same mechanism,
   after M3 core proves out.
3. Empty-pair elision (6 on the home page) — an empty block still needs an
   insertion anchor unless its position is recoverable from siblings; not
   worth special-casing in v1.
