# Compiled Output Optimization Plan — size, allocation, and closure churn

Status: Phase 0 LANDED (2026-07-08) — `codegen-size` + `bundle-size` suites,
baselines recorded, ratio guards active (see below). Phases 1–3 proposed.
Author context: follow-up to the binding-bag pre-shape change (superseded by
Phase 1 below).

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
- **Bag fields are compiler-private.** runtime.ts never reads `slots[0]` fields
  by name; the compiled-code ↔ runtime property contract is only `__s.block/
  slots/cleanups`, `__block.parentNode/endMarker`, element `$$<event>` keys,
  the `{fn, args}` descriptor, and dev-only `__oct_loc`/`locs`/`__oct_suppress`.
  We can rename every bag field freely.
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
workspace runtime + virtuals) via rolldown `codeSplitting` — because in real
apps user code eclipses the runtime, the app-only ops are the primary ratchet.
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

0c (svelte-jsbench app) remains open. Editing the codegen-size corpus
invalidates its baseline — re-record deliberately.

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

---

### Phase 3 — Helper calls for repeated patterns + emission diet

Independent, individually-measurable items, roughly by value:

- **3a. Mount commit fusion** — covered by Phase 1's factory (insert + commit
  + allocation in one call). For `_b = {}` static-template bodies, a paired
  `_$b0(__s, _root)` keeps them one line too.
- **3b. Event helper with in-place descriptor mutation.**
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
- **3d. Emit `const __block = __s.block;` only when referenced** (today
  unconditional, compile.js:3276; Phase 1 factories remove most uses).
- **3e. Deferred-mount seeds** (`{ _b._el$N = el; _b._prev$N = undefined; }`)
  fold into the Phase-1 factory args (el + `undefined`) — free once 1 lands.
- **3f. Update-diff helpers for attr/class/style — MEASURE FIRST, likely skip.**
  The `{ const _v = …; if (_b.e !== _v) { _$setAttribute(…); _b.e = _v; } }`
  lines are the per-render hot path; with 1-char fields they're already small,
  and a helper adds a call to every diff on every render. Only take this if 0b
  shows the bytes matter and the A/B shows no regression.
- **3g. Runtime property names (`parentNode`, `endMarker`) — REJECTED for
  renaming.** They're public Block fields used across runtime.ts; compiled
  code's remaining references after 1+3a are few (noTemplate hosts, anchor
  fallback). Not worth an API break; revisit only if 0a says otherwise.

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

- octane-tsrx js-framework bundle (normalized minify, gzip) moves measurably
  toward ripple's; concrete target set once 0a records honest gzip numbers
  (raw-byte gap today is 2.1×; the plan aims to close the *app-code* share
  of it — runtime size is out of scope here).
- Zero per-render closure allocations for static branches; one array per
  capturing construct otherwise.
- No perf regression outside noise on the three suites, judged by same-session
  A/B.
- No absolute paths in prod output.

### Execution order

0 → 3c (independent, trivial, immediate size+privacy win) → 1 → 3b/3d/3e →
2 → 3f only if measurement says so. Each phase: own PR, own changeset (patch),
own A/B numbers in the PR description.

### Open questions (maintainer input wanted)

1. Arity-bucket shared factories (recommended) vs per-body factories — accept
   shared maps/Tagged fields for minimal code, or pay code for specialized
   representations? Plan assumes shared; Phase 4 A/B can veto.
2. Bucket ceiling K (proposal: 12) and whether >K bodies should split their
   bag or take the inline-literal fallback (proposal: fallback).
3. Is the svelte-jsbench app (0c) wanted now or after the ratchet exists?
4. Should `bundle-size` also cover the naive/deopt app variants (authoring-
   cliff size, not just speed)?
