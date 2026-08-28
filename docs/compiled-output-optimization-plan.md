# Compiled Output Optimization Plan — size, allocation, and closure churn

Status: Phases 0 + 1 + 2 + 3b + 3c + 3d + 3h–3n LANDED
(2026-07-08–15) — measurement suites + guards, bag-factory codegen, hoisted
helpers, compact production hook slots, binding-lifetime specialization,
mount-only callback sinking, hydration isolation, and compiler-proven void
render paths (see the LANDED notes in each phase). Remaining candidates are
tracked below. Author context: follow-up to the binding-bag pre-shape change
(superseded by Phase 1).

## 1. Problem statement

Octane's client codegen is verbose in ways that survive minification, and it
re-allocates per render in ways the fine-grained frameworks don't:

1. **Bag construction is assignment soup.** The mount path allocates the binding
   bag and fills it with 1–2 property writes per binding. The interim pre-shape
   change (`_b = { _txt$0: undefined, … }`) fixed hidden-class churn but kept
   every assignment statement AND initializes fields to `undefined` — TurboFan
   sees no useful field types at allocation, and the code got *longer*.
2. **Bag field names and runtime property accesses are minify-proof.**
   `_b._compHost$5`, `_prev$1`, `__block.parentNode.insertBefore(_root,
   __block.endMarker)` — terser mangles locals, never property names. Every
   binding pays these bytes in the shipped bundle.
3. **Branch helpers are per-render closures.** Every `@if/@else/@for/@empty/
   @switch/@try/children` body is a function declaration INSIDE the component
   body (`hoistBodyHelper` pushes to `inlinedSubs`, compile.js:6632-6642,
   emitted at 3237/3439). A component with 4 branches allocates 4 closures on
   every render. Ripple/Solid/Svelte 5 have no equivalent cost — they don't
   re-render.
4. **Repeated multi-token patterns** (mount commit pair, event bundles, text
   mounts, ref/spread cleanups) are inlined per binding instead of being
   runtime calls — bigger output, and colder code than a shared helper whose
   ICs heat up across all call sites.
5. **Hook slot symbols embed absolute paths in prod.** Every hook emits
   `Symbol.for("octane:<ctx.filename>:<Comp>.<hook>#<n>")` unconditionally
   (compile.js:4053-4054). Verified in a real build:
   `benchmarks/js-framework/octane-tsrx/dist` contains
   `octane:/Users/trueadm/Projects/octane/…/Main.tsrx:Main.useState#0` — a
   size cost AND a filesystem-path privacy leak. Only HMR needs the
   `Symbol.for` registry (runtime.ts:8457-8514); prod never re-imports.
6. **Nothing measures any of this.** The bench system has no bundle- or
   codegen-size metric (verified: no gzip/brotli/dist-size measurement in
   benchmarks/, scripts/, or package.json).

### Measured starting point (2026-07-08, this machine)

| Metric | Value |
| --- | --- |
| js-framework same-app bundles (terser, raw) | react 195.3 KB · **octane-tsrx 60.3 KB** · octane-jsx 57.8 KB · **ripple 29.0 KB** |
| Main.tsrx source → compiled | 11.0 KB → 20.2 KB (1.8×) |
| Main.tsrx compiled, minified / gzip | 12.7 KB / 3.3 KB |
| Whole-bench-corpus source → compiled | 33.9 KB → 58.6 KB (1.7×) |

Octane ships **2.1× ripple's bytes for the identical app**. That gap — not
micro-timings — is the primary target. (Perf lesson from the pre-shape A/B:
shape-prealloc alone measured neutral; V8's store-transition ICs already
handled the old pattern. Every phase below must justify itself against the
size metric and a same-session perf A/B.)

## 2. Verified constraints (what makes this safe)

These were audited before writing the plan (file:line refs are 2026-07-08):

- **The runtime never compares branch-helper identity.** Branch selection is by
  numeric index (`renderBranchSlot`, runtime.ts:9945), rows by key; `block.body`
  is reassigned every render (runtime.ts:10861/10864, 10264, 8676). Hoisting
  bodies out of the component cannot change reconciliation.
- **`__extra` is a reserved, always-undefined ABI slot.** `renderBlock` already
  forwards `block.extra` as the third body arg (runtime.ts:1545); `createBlock`
  accepts it (1485-1504); no call site passes it today. It is a ready-made
  channel for captured values — no body-signature change needed.
- **Bag fields are compiler-private — with ONE exception found during Phase 1.**
  The suspense-hide path (`detachSubtreeRefs`, runtime.ts ~10378) discovers
  refs by scanning `slots[0]` keys by PREFIX: `_ref$N`/`_sp$N`/`_fi$N` paired
  with `_el$N`. Those fields therefore keep their long names (and force the
  `bagOf` spill — named keys can't ride positional factories); everything else
  renames freely. Phase 3 candidate: replace the key scan with a compiler-
  emitted ref manifest so these fields can shorten too.
  **RESOLVED — ref manifest LANDED 2026-07-09.** The compiler emits a
  module-scope constant per ref-bearing body (`const _rm$N = ['r','a','b',
  's','c','d','f','e','']` — flat [kind, field, elField] triads; 'r' element
  ref / 's' spread / 'f' fragment ref) and stamps it once after the bag
  commit (`__s.refFields = _rm$N` — the field is pre-declared on ScopeImpl +
  BlockImpl so the stamp never transitions a hidden class). detachSubtreeRefs
  walks the manifest with indexed reads instead of the `for-in` key scan;
  detach/re-attach TIMING is untouched (discovery changed, not semantics —
  pinned by conformance/suspense-refs.test.ts, which cycles all three kinds
  plus de-opt descriptor refs across a suspend). makeBag's `localNamed`/
  `hasNamed` machinery is deleted — every field is lettered and every body
  ≤16 fields rides the arity factories. Corpus size ~flat (the corpus is
  ref-light); the win is ref-heavy code (bindings) + monomorphic bag shapes
  + a cheaper hide walk.
- **Event descriptors are read at dispatch time** (`fireEventSlot`,
  runtime.ts:4971-5000, reads `node[key]` per event). A helper may mutate the
  descriptor in place instead of re-assigning a new object.
- **`@for` already has a data channel** (deps array → runtime pure-promotion,
  runtime.ts:10737-10744) and rows already receive `item` positionally +
  `__block.itemIndex` — precedent for feeding hoisted bodies.
- **Capture analysis exists**: `collectFreeIdentifiers` (compile.js:7252-7279)
  already classifies row bodies; it generalizes to all branch helpers.

## 3. Phases

Ordering rule: **Phase 0 lands first** so every later phase has a recorded
before/after. Phases 1–3 are independent enough to land separately, each with
its own A/B + size delta + changeset.

---

### Phase 0 — Measurement: bundle-size + codegen-size in the bench system

**0a. `bundle-size` suite** (new entry in bench.mjs `SUITES`): programmatic
`vite build` of each js-framework app (pattern already exists — news
run.mjs:58-68 builds clients in-process), then record the client JS bytes.

- Metrics per target: `raw`, `gzip`, `brotli` bytes of the summed dist JS.
- Schema: emit as ops (`{ median: bytes, min: bytes }`) so `--compare` and
  `--ratios` work unchanged, AND mirror into `meta` for readability. The
  compare thresholds (±15%) are ms-shaped but serve fine as a size ratchet.
- Ratio guards in `baselines/ratios.json`: `octane-tsrx gzip / ripple gzip`
  and `octane-tsrx gzip / solid gzip` with an initial honest ceiling (record
  first, then set ~5% above measured; tighten as phases land).
- **Fairness note:** the apps' own vite configs differ (solid has
  `minify:false`, react passes:2, octane passes:5). The suite must build all
  targets with ONE normalized minify setting (esbuild or terser passes:2)
  via an inline config override, not the apps' local configs.
- Runtime-vs-app split: also record `octane` chunk vs app-code bytes if the
  build is code-split enough to separate them; the interesting ratchet for
  THIS plan is app-code (compiler output), runtime size is a separate axis.

**0b. `codegen-size` suite** (fast, no browser, no server): compile a fixed
corpus (the four bench `.tsrx` apps + ~10 representative test fixtures)
through `octane/compiler` in-process, minify with esbuild, gzip, and report
total bytes as ops. Runs in <2s — this is the per-commit regression signal
for every phase below and gets baselines + `--compare` like any suite.

**0c. (Optional, separate PR) svelte-jsbench app** for the Svelte 5 comparison
the maintainer wants — same rows spec as the other apps. Not a blocker for
phases 1–3; the ripple/solid ratios already anchor the ratchet.

*Exit criteria: baselines recorded for both suites on main before Phase 1.*

**LANDED 2026-07-08.** `benchmarks/codegen-size/` + `benchmarks/bundle-size/`
(0a with builds into the suite's own gitignored dist/; 0b with a 14-file
corpus), registered in bench.mjs (Node-only, deterministic — `median === min`),
baselines recorded, three ratio guards added (exact byte ratios,
hardware-independent, enforced by the weekly CI `--ratios` run):

`bundle-size` additionally splits each build into an **`app` chunk** (modules
under the app's src/) and a **`framework` chunk** (node_modules + the octane
workspace runtime + virtuals) via rolldown `codeSplitting`. App output is the
scaling term as applications grow, so the app-only ops are the primary ratchet.
Recorded split (gzip): octane-tsrx **app 3,313 / fw 23,152**, octane-jsx app
2,982 / fw 23,237, react app 2,160 / fw 60,076, ripple app 2,312 / fw 10,502,
solid app 1,991 / fw 12,741. Reading: octane's TOTAL gap vs ripple is mostly
runtime (23.2 vs 10.5 KB — a separate axis), while the codegen share this plan
targets is app code at **1.43× ripple / 1.66× solid / 1.53× react**.

| guard | recorded | ceiling |
| --- | --- | --- |
| bundle-size `app_gzip` octane-tsrx / ripple | **1.43×** (3,313 / 2,312 B) | 1.5 |
| bundle-size `app_gzip` octane-tsrx / solid | **1.66×** (3,313 / 1,991 B) | 1.75 |
| bundle-size `js_gzip` octane-tsrx / ripple | **2.07×** (26,465 / 12,814 B) | 2.2 |
| bundle-size `js_gzip` octane-tsrx / solid | **1.80×** (26,465 / 14,732 B) | 1.9 |
| codegen-size `gzip` compiled / source | **1.19×** (21,822 / 18,321 B) | 1.25 |

0c subsequently landed, including Svelte 5 variants for the rows, TodoMVC, and
chat-stream bundle-size surfaces. Editing the codegen-size corpus invalidates
its baseline — re-record deliberately.

---

### Phase 1 — Bag construction: real values, one factory call, 1-char fields

Replace the mount path's `_b = {…undefined…}` + N assignments with locals +
**one call to a shared runtime arity-bucket factory** whose fields are `a…z`:

```js
// today (post-preshape):                    // proposed:
_b = { _el$0: undefined, _fn$0: undefined,   const _v0 = label;
       _a$0$0: undefined, _txt$1: undefined, _b = _$b6(__s, _root,
       _prev$1: undefined, … };                 _el0, setN, n + 1,
_b._el$0 = _el0;                                _$htext(_el0, _v0), _v0, _el1);
_b._fn$0 = setN;                             // factory: inserts _root before
_b._a$0$0 = (n + 1);                         //   __block.endMarker, commits
…                                            //   __s.slots[0] = bag, returns it
__block.parentNode.insertBefore(_root, __block.endMarker);
__s.slots[0] = _b;
```

- **Runtime factories** `_$b1.._$bK` (tier-2 semi-public, K ≈ 12):
  `_$b3(scope, root, a, b, c)` allocates `{ a, b, c }` as a literal (final
  hidden class at birth, real values → real field representations), performs
  the insert (`scope.block.parentNode.insertBefore(root, scope.block.endMarker)`
  — or the `drainFrag` variant via a flag/paired factory family for multi-root),
  commits `scope.slots[0]`, and returns the bag. Bodies above K fall back to an
  inline literal with real values and 1-char keys (still one allocation).
  `noTemplate` bodies keep no bag (unchanged).
- **Why shared factories, not per-body `_$createBlockXYZ`:** the allocation
  site must be per-shape either way; a shared arity factory gives ONE hot,
  fast-warming allocation site per arity with a shared map across all bodies
  of that arity, at near-zero code cost per body. A per-body hoisted factory
  would keep per-body maps (better field-representation specialization) but
  re-introduces the code bloat we're removing. Decision: arity-bucket, and let
  the Phase-4 A/B veto it if representation generalization shows up in timings
  (it did not when tested indirectly via the pre-shape A/B).
- **Ordering correctness:** all DOM work already happens in locals (template
  walks are `const _elN` lines; `htext`/`htextSwap` calls move into argument
  position, evaluated left-to-right in current mount order; the deferred
  htextSwap flush ordering is preserved because all walks precede the factory
  call). The commit stays last (throw-safety: an exception inside an argument
  leaves `slots[0]` undefined and the next attempt re-mounts — same as today,
  compile.js:4824-4831).
- **Field naming:** compiler assigns `a, b, c…` in mount order and records the
  binding→letter map; every update-path reference (`_b._prev$1` →`_b.e`),
  anchor read (`__s.slots[0]._ifAnchor$2` → `__s.slots[0].g`), and cleanup
  closure uses the letter. Same names in dev and prod (no shape divergence
  between what tests exercise and what ships).
- **Events within the bag:** store the `{ fn, args }` descriptor as ONE field
  (see Phase 3b) instead of `_fn$N` + `_a$N$i` — Phase 1 lays out fields to
  anticipate that (descriptor field + element field per event binding).
- Supersedes the 2026-07-08 pre-shape change (its scan machinery is replaced
  by the explicit binding→field map; keep its changeset, rewrite the text).

*Expected effect: mount block shrinks from ~2 lines/field + literal to one
call; update lines shrink via 1-char fields. Estimate on Counter sample:
mount 14 lines → 5; measured target from 0b before landing.*

**LANDED 2026-07-08.** Implemented as designed with two deviations:
(1) mount values fill pre-declared `_mN` LOCALS (minifier-mangled to 1 char)
that the factory receives positionally — inlining every value expression into
the call would have broken the per-binding `{ const _v = …; helper(); }`
grouping and DOM-op ordering; the locals preserve statement order exactly and
cost nothing post-minify. (2) ref/spread/fragmentRef fields keep long names +
`bagOf` spill (see the corrected constraint above — the runtime's suspense-hide
key scan reads them; a ref manifest is now a Phase 3 item). Runtime gained
`bag0`…`bag16` + `bagOf` (tier-2 exports, +110 B gzip). The emitted-size change
is covered by the codegen-size corpus, while event behavior remains covered by
the client, hydration, and browser suites.
Measured: codegen-size corpus raw −10.9%, **minified −17.6%** (75,909 →
62,522 B), gzip −5.5% (expansion 1.19× → **1.13×**); bundle-size app-chunk
gzip −2.0% tsrx / −3.3% jsx (app/ripple **1.40×**, app/solid 1.63×). Perf:
same-session A/B on js-framework/dbmon/effectful-list neutral within noise
(the flagged `clear` +11% did not reproduce — that op swings ±1.5ms with GC
timing). Guards ratcheted: codegen gzip 1.25→1.18, app/ripple 1.5→1.45,
app/solid 1.75→1.70; baselines re-recorded.

---

### Phase 2 — Hoist branch helpers to module scope; captures ride `__extra`

Route `hoistBodyHelper` output to `ctx.hoistedHelpers` (where `_frag$N`,
`_key$N`, and hook symbols already live) instead of `inlinedSubs`:

- **Zero-capture helpers hoist verbatim.** In the audited sample, `__else$1`
  and `__empty$3` capture nothing — a large fraction of real branches are
  static.
- **Capturing helpers get an env tuple.** Extend `collectFreeIdentifiers` to
  every helper kind; the call site passes the captured values and the runtime
  stamps them on the block:

  ```js
  // module scope:
  function __then$0(__props, __s, __extra) {
    const [label] = __extra;            // injected header
    …existing body…
  }
  // component body:
  _$ifBlock(__s, 1, host, (n > 2), __then$0, __else$1, anchor, [label]);
  ```

  Runtime: `ifBlock/switchBlock/tryBlock/activityBlock/forBlock/portal/
  children-thunk` call sites accept an optional trailing `env` and set
  `block.extra = env` on EVERY invocation (before `renderBlock`); `renderBlock`
  already forwards it (runtime.ts:1545). `forBlock`'s survivor path
  (`updateSurvivor`, runtime.ts:10861-10867) additionally passes it as the
  row body's third arg.
- **Staleness semantics are unchanged.** Today a branch re-rendered on its own
  (e.g. state inside the branch) runs last render's closure over last render's
  values; with env, it reads `block.extra` from the last parent render — the
  identical staleness. Env snapshots at the same moment closures captured.
- **Nesting** works structurally: an inner `@if` inside a hoisted `__then$0`
  emits its call site inside `__then$0`, passing an env built from values in
  scope there (params + destructured `__extra`).
- **What this buys:** N closure allocations per component render → at most one
  small array per capturing construct per render (zero for static branches);
  component function bodies shrink (helpers no longer re-shipped inside the
  body — code moves to module scope once). It also makes helper identity
  stable, though nothing relies on it (childSlot's render-fn special case,
  runtime.ts:7941-7952, stays as-is).
- **Interaction with @for deps:** unchanged — deps remain the change-detection
  snapshot for pure-promotion; env is the data channel. Where both exist they
  can share the same array (deps IS the captured-locals list for depEligible
  rows) — fold if trivial, else keep separate.
- **HMR:** hoisted helpers are module-scope values re-created on module
  re-exec; the swapped component body references the new helpers — same as
  `_frag$N` today. No registry semantics involved.

*Risks: the widest-blast-radius phase (touches every construct emit + 6
runtime entry points). Land behind exhaustive differential runs; the item-body
capture analysis is the sharp edge (destructured params, shadowing — reuse the
row-body rules at compile.js:7224-7238).*

**LANDED 2026-07-09.** As designed, with these findings:

- `helperCaptures`/`unionEnv` (compile.js): free identifiers ∩ the locals
  visible at the call site, per construct. A construct's helpers share ONE
  env tuple (block.extra is per block; then+else / all cases / try+pending+
  catch / item+empty each destructure the same sorted union — unused names
  are harmless consts). `__pu$N` parallel-use temps are matched by name shape
  (they're minted after collectComponentLocals runs).
- **Sharp edge found: JSX tag references.** `collectFreeIdentifiers` never
  visited tag positions (the @for dep analysis never needed them — bodies
  with component tags are already non-depEligible), so `const C = props.comp;
  <C/>` silently dropped `C` from the env and every such helper broke at
  module scope. The walker now collects component-shaped identifier tags,
  member-tag ROOT objects, and dynamic `<{expr}/>` expressions; host tag and
  attribute names stay static. (This also makes @for's deps see component
  tags — moot for promotion, since such bodies aren't depEligible.)
- **Nesting**: hoistBodyHelper extends `ctx.currentComponentLocals` with the
  helper's own params/env/locals for the duration of its compile, so a nested
  construct's env resolves at ITS call site (inside this helper's body) —
  captures propagate outward transitively because the free-identifier walk
  sees through nested construct bodies.
- **@for**: the deps array IS the env tuple (the plan's "fold if trivial") —
  emitted whenever the item/@empty helpers capture anything, not only for
  dep-pure promotion; flags bit 2 still gates the promotion compare. The
  union may widen deps with @empty-only captures (conservative). A deps arg
  now forces the flags placeholder (positional alignment).
- **Folded fragments** (`extractFragment`): the env tuple threads as ONE
  ArrayExpression `props.hN` hole (built component-side, read renderer-side)
  for if/switch/try; @for reuses the existing per-dep hole threading with the
  depEligible guard relaxed.
- **Runtime**: ifBlock/switchBlock (via renderBranchSlot), tryBlock (env on
  the TrySlot — the arms mount from stored state), activityBlock, forBlock
  (env on the ForSlot; mountItem stamps item blocks, updateSurvivor refreshes
  survivors and passes it as the lite path's third arg), portal, and
  renderOffscreen (transition WIPs — a capturing helper's destructure throws
  off-screen without it). block.extra persists, so a branch re-rendering on
  its own reads last parent render's tuple — the closure staleness, verbatim.
- **`__children$N` stays inline** — invoked through props (childrenAsBody /
  render-prop checks), no construct block to carry the tuple. Candidate for a
  later pass (attach env to the fn, thread through the children invoke sites).
- Validation: full suite green (616 files / 4,569 tests, both compile modes),
  website dev+preview e2e, codegen-size + bundle-size `--compare` clean
  (size ~neutral — code moved to module scope, small env boilerplate ↔
  removed closure boilerplate). Same-session js-framework A/B: neutral with
  `runlots` (allocation-heavy) improving ~8% (13.9 → 12.8ms).

---

### Phase 3 — Helper calls for repeated patterns + emission diet

Independent, individually-measurable items, roughly by value:

- **3a. Mount commit fusion** — covered by Phase 1's factory (insert + commit
  + allocation in one call). For `_b = {}` static-template bodies, a paired
  `_$b0(__s, _root)` keeps them one line too.
- **3b. Event helper with in-place descriptor mutation — LANDED 2026-07-09.**
  As designed, with one refinement: the update helpers are BRANCH-FREE
  (`d.fn = fn; d.args[0] = a0;`) — two plain field writes cost less than the
  old compare + rebuild + re-assign, and keyed-list survivors were already
  skipped a level up by the pure/deps short-circuit, so the compare bought
  nothing. Arity family `evt0/1/2` + `evtN` rest fallback (args array),
  matching fireEventSlot's dispatch switch; arity-0 descriptors share one
  empty args array. One bag field per binding (`_ev$N`, lettered) instead of
  el + fn + each arg. Registered in the runtimeNeeded loop (the emit fns
  don't see ctx). Event behavior is covered through public interactions; raw
  output size is guarded by the codegen-size and bundle-size benchmarks.
  Original design:
  Mount: `_b.c = _$evt1(_el0, "$$click", setN, n + 1)` — helper builds
  `{ fn, args }`, assigns `el[key]`, returns the descriptor.
  Update: `_$evt1u(_b.c, setN, n + 1)` — compares `fn`/`args[i]`, mutates the
  existing descriptor (dispatch reads `el[key]` per event, so mutation is
  observed; no re-assignment, no new object). Arity variants `_$evt0/1/2` +
  a rest fallback, mirroring `fireEventSlot`'s arity switch. Plain-fn events
  (`el["$$click"] = handler`) are already minimal — unchanged.
  This deletes the largest repeated update block in the codegen
  (compile.js:5711-5729) and two bag fields per event.
- **3c. Prod hook symbols: `Symbol()` + drop the path string.**
  When `hmr` is off, emit `const _h$0 = Symbol();` — the registry key is only
  consumed by HMR's re-import identity (runtime.ts:8457-8514, comment
  compile.js:4047-4052). Same branch in slot-hooks.js. Fixes the absolute-path
  leak (§1.5) and removes ~80-120 chars/hook from prod bundles. Dev/HMR output
  unchanged. Note in docs that dev≠prod output already (locs/hmr), so this adds
  no new divergence class; tests compile with hmr off and rely only on
  module-instance stability, which `Symbol()` preserves.

  **LANDED 2026-07-08 — twice.** `ctx.hmr` gates `allocHookSymbol` (server
  codegen always off); `slotHooks(source, id, { hmr })` gets the same gate
  from the vite plugin (per-module SSR-aware). **The first cut emitted BARE
  `Symbol()` and broke the website**: the description is load-bearing — the
  runtime composes custom-hook slot paths by CONCATENATING slot descriptions
  (`resolveSlot`/`currentPathSlot`, runtime.ts ~1988-2010), so description-less
  slots collapsed every composed path to `"undefined|undefined"` keys and
  collided custom-hook state across call sites (the router's `useStore` →
  hydration mismatch on every route; server compiles prod-mode in dev SSR
  while the browser compiles dev-mode, so the two sides rendered different
  trees). Fixed: `Symbol("<djb2(filename)>#<n>")` — unique, ~10 chars, no
  path. **Why the suite missed it:** vitest runs the plugin in serve mode, so
  every fixture compiled hmr:true and the prod branch had zero runtime
  coverage — closed by `tests/hydration/prod-mode-hydrate.test.ts`, which
  compiles a custom-hook + `@if` fixture with EXPLICIT prod options, SSRs it,
  and hydrates with both a dev-compiled and a prod-compiled client (adoption
  identity + value correctness + call-site state independence; verified to
  fail 2/4 against the bare-Symbol() bug). Also pinned by hmr.test.ts (both
  modes, both passes). Verified zero path strings in a fresh production build
  and clean hydration on all website routes, dev AND `octane-preview` prod.
  Measured on top of Phase 1: corpus minified 62,522 → **55,179 B**, gzip
  20,628 → 19,869 (expansion **1.08×**); app-chunk gzip tsrx 3,247 →
  **3,172 B** (app/ripple **1.37×**, app/solid 1.59×). Cumulative Phase 1 +
  3c vs baseline: **minified −27.3%, gzip −9.0%**, app/ripple 1.43× → 1.37×.
  Guards: codegen gzip → 1.12, app/ripple → 1.40, app/solid → 1.65.
- **3d. Emit `const __block = __s.block;` only when referenced — LANDED
  2026-07-15.** The compiler now adds the alias after planning only when the
  final body references it, and adjusts setup source-map lines when the header
  is absent. This removes a property read that minifiers must otherwise retain
  because `__s.block` could be an accessor.
- **3e. Deferred-mount seeds** (`{ _b._el$N = el; _b._prev$N = undefined; }`)
  fold into the Phase-1 factory args (el + `undefined`) — free once 1 lands.
- **3f. Update-diff helpers for attr/class/style — MEASURE FIRST, likely skip.**
  The `{ const _v = …; if (_b.e !== _v) { _$setAttribute(…); _b.e = _v; } }`
  lines are the per-render hot path; with 1-char fields they're already small,
  and a helper adds a call to every diff on every render. Only take this if 0b
  shows the bytes matter and the A/B shows no regression.
- **3h. Build-time dev gating — LANDED 2026-07-09.** All dev-only runtime
  diagnostics (hydration-mismatch warns, controlled-input/select warnings,
  the act() environment warning, DOM-prop hints, unkeyed-child warning,
  use() waterfall hints) now sit behind inline
  `process.env.NODE_ENV !== 'production'` (the ecosystem-standard token: the
  transpile-only dist build preserves it; consumer bundlers fold it; bare-Node
  SSR never crashes, unlike `import.meta.env`). Whole-dev functions use a
  build-time early return; scattered sites are wrapped inline (a module-level
  const would defeat esbuild's DCE). Verified all target strings absent from
  a production build. Measured: framework chunk **23,262 → 21,648 B gzip
  (−6.9%)**, totals 26.4 → 24.8 KB (octane/ripple total 2.06× → **1.94×**).
  Guards ratcheted: total js_gzip vs ripple 2.2 → 2.05, vs solid 1.9 → 1.8.
- **3i. Binding-lifetime specialization — LANDED 2026-07-15.** The compiler
  proves the identity of state/reducer dispatchers, getters, refs,
  explicit invariant `useCallback` results, and compiler-memoized local
  callbacks. It separately recognizes `useEffectEvent` wrappers as
  behaviorally non-reactive for event bindings: wrapper identity is fresh, but
  every committed wrapper dispatches through the same committed body. A
  spread-free event using only those values installs once at mount and no
  longer stores an element/descriptor in the binding bag or emits an update
  helper. Any spread on the same host keeps the event live so JSX source order
  is re-applied after spread updates.
  Syntactically fresh class object/array/function values also skip an
  impossible identity comparison and its previous-value bag field while
  retaining the same setter frequency. The same pass completed 3d, moved the
  remaining hydration/controlled/use() diagnostics behind inline production
  gates, and isolated the package `version` JSON import behind a tree-shakable
  module boundary.

  Intermediate normalized bundle results, before 3j–3n: rows app gzip
  **2,714 → 2,459 B** (−9.4%), versus
  Svelte 5 at 2,301 B (**1.07×**); TodoMVC **2,207 → 2,053 B**, versus Svelte
  at 1,511 B (1.36×); chat-stream **2,624 → 2,608 B**, versus Svelte at 2,279 B
  (1.14×). Rows total gzip fell **30,632 → 29,423 B** (−3.9%); its remaining
  gap to Svelte is predominantly the framework chunk (26,964 vs 15,980 B), not
  compiled app code. The fixed codegen corpus' compiled/source gzip expansion
  moved from 1.04× to **1.02×** (the event-order regression fixtures added in
  this phase change both sides of the corpus, so absolute corpus bytes are not
  directly comparable). Direct Svelte guards now cap rows total/app at
  1.65×/1.10×, TodoMVC at 1.65×/1.40×, and chat-stream at 1.62×/1.18×.

  A same-session normal-iteration main→candidate A/B for 3i on js-framework, dbmon,
  and effectful-list found no regression: dbmon stayed within 3.5% on every
  operation, effectful-list within 8.1% (0.007 ms on the no-deps micro-op), and
  rows within the noise-aware threshold (the largest score swing was `clear`
  at +11.6%, while its median changed only 22.0 → 22.4 ms).
- **3j. Numeric production hook slots + composable range ABI — LANDED
  2026-07-15.** Direct base-hook sites in a compiler-owned `@{}` render scope
  now use small integer keys. A scope owns its hook map, so those integers need
  be unique only within that compiled body; HMR and profiling retain Symbols,
  as do nested/arbitrary callables and custom-hook boundaries whose identity
  can cross a scope or module. The client and server runtimes accept
  number-or-Symbol hook keys and length/type-prefix composed custom-hook paths
  so a numeric segment cannot alias a described Symbol.

  Plain `.js`/`.ts` hook sites and compiler helpers that need globally
  composable Symbol descriptions reserve a disjoint production range with
  `hookSlots(count)` and use the reserved numbers as short descriptions. This
  preserves cross-module and duplicate-module-instance isolation without
  shipping filename hashes per site. Optional argument positions are padded
  before a numeric trailing slot where necessary, while rest-shaped hooks read
  the final argument, preserving zero-argument hooks and number-valued user
  arguments. Spread calls and any proof boundary fail closed to Symbols.
- **3k. Mount-only compiler callback sinking — LANDED 2026-07-15.** A
  compiler-owned, non-escaping arrow/function used exclusively by native event
  slots whose handler and bundled arguments are proven lifetime-invariant no
  longer needs an auto-generated `useCallback` site. One consumer receives the
  function expression directly in the mount assignment; multiple consumers
  share a `const` allocated inside the mount branch. HMR/profile builds,
  spreads, component/children ownership boundaries, refs, directive/dynamic
  uses, unstable captures, duplicate writers, and any setup escape keep the
  original declaration and hook lowering. Observable callback identities are
  therefore unchanged.
- **3l. Hydration capability isolation — LANDED 2026-07-15.** Adoption cursor,
  mismatch recovery, seeded previous values, and hydration-aware DOM writes now
  live behind a `HydrationCapability` constructed only by `hydrateRoot`.
  Shared DOM helpers make a nullable capability dispatch, but an ordinary
  `createRoot` bundle no longer roots the hydration implementation graph and a
  production bundler can eliminate it. Hydration state remains scoped across
  nested/foreign-root re-entry, and hydration-specific behavior continues
  through the same capability boundary rather than being weakened for size.
- **3m. Compiler-proven void output paths — LANDED 2026-07-15.** Blocks now
  carry a nullable output handler. Generic `createRoot`, `hydrateRoot`, and
  component sites install the handler that reconciles arbitrary JavaScript
  returns; compiler-proven imperative bodies install none, so their bundles do
  not retain descriptor/array/primitive return reconciliation merely because
  every block shares `renderBlock`.

  The compiler selects `componentSlotVoid` only for an `@{}` body with no
  value-bearing return in its own function. Nested-function returns do not
  poison the proof, a bare `return;` is safe, and any syntactic value return is
  conservatively generic without attempting control-flow reachability. HMR
  also remains generic because a later module version may change the return
  contract. Functions that return hosts, primitives, `null`, arrays, or element
  descriptors keep the full public behavior.

  The plain-module production transform can similarly replace the narrow
  `createRoot(target).render(ImportedComponent[, props])` bootstrap with the
  compiler-only `__createVoidRoot`. Vite resolves and loads the actual imported
  module through its module graph, then accepts Octane's direct-export metadata
  only while a fingerprint of the final transformed code still matches. Alias
  targets and virtual modules therefore prove their own contract; a raw disk
  lookalike is never evidence. Unknown files, re-exports, indirect calls,
  escaping roots, server/dev/HMR/profile builds, watch builds, downstream code
  mutation, and value-returning components stay on `createRoot`. The neutral
  compiler and Rspack also fail closed unless a caller supplies an equivalent
  trusted proof; Rspack's available `importModule` route was rejected because
  it would evaluate user code during the build. Evaluation order and the public
  `Root` object remain unchanged.
- **3n. Narrow expression and DOM helper proofs — LANDED 2026-07-15.** A
  conditional expression is now a known string only when both arms are known
  strings, allowing the string-hole path without widening the existing type
  proof. Dynamic, statically named lowercase `data-*` attributes with a
  proven-string expression use `setStringData`, which omits generic property,
  alias, namespace, and name-validity routing while retaining hydration,
  removal, coercion, and development-warning semantics for an inaccurate type
  assertion. The unnamespaced write is valid for HTML, SVG, and MathML hosts,
  including component templates whose destination namespace is chosen at runtime.

  Two controlled-form cases receive similarly strict helpers. An
  `<input>`/`<textarea>` with exactly one `defaultValue`, no `value`, and no
  spread uses the uncontrolled default-value writer without allocating a
  controlled-state record or composition listeners. An `<input>` with one
  `checked`, one static `type="checkbox"|"radio"`, and no spread uses the
  checkable writer, retaining restoration and controlled-state semantics while
  omitting impossible text-composition listeners. Selects, duplicate or
  conflicting writers, dynamic types, and spread-bearing elements remain on
  the generic helpers.
- **3g. Runtime property names (`parentNode`, `endMarker`) — REJECTED for
  renaming.** They're public Block fields used across runtime.ts; compiled
  code's remaining references after 1+3a are few (noTemplate hosts, anchor
  fallback). Not worth an API break; revisit only if 0a says otherwise.

### Current checkpoint and next measured candidates (2026-07-15)

The final normalized production builds are smaller than their Svelte 5
equivalents on all three measured surfaces:

| surface | Octane gzip | Svelte 5 gzip | delta |
| --- | ---: | ---: | ---: |
| rows | **17,448 B** | 18,281 B | **−833 B** |
| TodoMVC | **18,408 B** | 18,481 B | **−73 B** |
| chat-stream | **18,878 B** | 19,123 B | **−245 B** |

The rows app chunk is also smaller than Svelte's (2,234 vs 2,301 B gzip), while
Todo and chat still spend more bytes in app plumbing (1,906 vs 1,511 B and
2,523 vs 2,279 B respectively) but make that back in the reachable framework
chunk. Across the fixed 16-file codegen corpus, gzip(minified compiled output)
is now **22,512 B** versus **22,840 B** for source (**0.986×**). The checked-in
ratio guards were ratcheted to these final baselines.

**2026-07-18 update:** later correctness work and corpus-source growth made the
original checkpoint stale. After merging the controlled-checkable activation
fix, checked/radio restoration became an optional capability so applications
without a retained `checked` binding do not ship its radio-group graph. Current
normalized totals are 18,545 / 19,744 / 19,753 B for rows / TodoMVC /
chat-stream, and the weather app is 40,981 B. The current codegen corpus remains
24,397 B compiled versus 23,519 B source (1.037×). The deterministic baselines
and tight ratio guards were refreshed to these reproducible records.

Focused normal/production validation is green for the hook-slot ABI, callback
sinking, resolved-module root proof, generic value-return transitions,
known-string classification, controlled forms, and hydration adoption/re-entry.
The combined 3j–3n same-session main→candidate A/B found no performance
regression. The 30-sample dbmon medians were identical on five of six
operations, with mount moving 3.5 → 3.6 ms; effectful-list was identical on
four of six operations, with remount moving 8.6 → 8.7 ms and the no-deps update
improving 0.10 → 0.08 ms. In the shorter eight-sample rows run, the largest
slower median was 4.4%, while update and swap improved. Repository-wide
validation then passed: `pnpm typecheck`, the production package build, and
all **900 test files / 6,988 tests**, including the real dev/prod website
hydration browser gate.

The main deferred size candidate is a **shape-aware/no-else `@if`
specialization** for compiler-proven, non-suspending host-only arms. It is
higher risk than the landed reachability cuts: today's `ifBlock` also preserves
transition offscreen state, suspension/error atomicity, hydration adoption,
shared-boundary propagation, and exact unmount semantics. Do not split that
helper graph until a narrow proof and behavior tests cover every one of those
contracts. Smaller host-cache/fresh-binding extensions remain measurement-led
follow-ups, not assumed wins.

---

### Phase 4 — Measurement gates (applies to every phase)

For each landing:
1. `codegen-size` + `bundle-size` before/after (the point of Phase 0).
2. Same-session perf A/B (revert → run → re-apply → run) on js-framework,
   dbmon, effectful-list — NOT baseline-compare alone; checked-in baselines
   drift with machine state (observed: a warm run flagged "regressions" in
   solid/ripple).
3. Full `pnpm test` + typecheck + format; differential projects are the
   parity gate.
4. Ratio-guard ratchet: after phases 1–3, tighten the `octane/ripple` gzip
   ratio in `ratios.json` to lock in the win.

### Success criteria

- The normalized Octane rows, TodoMVC, and chat-stream bundles approach Svelte
  5's total gzip size without relaxing semantics. All three are now smaller,
  with final proof fixes, baselines, and ratio guards recorded.
- Zero per-render closure allocations for static branches; one array per
  capturing construct otherwise.
- No perf regression outside noise on the three suites, judged by same-session
  A/B. The combined 3j–3n A/B is neutral within measurement noise.
- No absolute paths in prod output.

### Execution record

0 → 3c → 1 → 3b/3d/3h → 2 → 3i → 3j/3k → 3l/3m → 3n. Phase
3f remains measurement-gated, 3g was rejected, and the shape-aware `@if`
candidate remains deferred behind its full semantic proof.

### Open questions (maintainer input wanted)

1. Arity-bucket shared factories (recommended) vs per-body factories — accept
   shared maps/Tagged fields for minimal code, or pay code for specialized
   representations? Plan assumes shared; Phase 4 A/B can veto.
2. Bucket ceiling K (proposal: 12) and whether >K bodies should split their
   bag or take the inline-literal fallback (proposal: fallback).
3. Is the svelte-jsbench app (0c) wanted now or after the ratchet exists?
4. Should `bundle-size` also cover the naive/deopt app variants (authoring-
   cliff size, not just speed)?
