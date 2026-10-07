# V8 shapes, inline caches, and allocation

Hot means per render, per node, per item, per event, per signal notification,
or per server request. Module initialization and once-per-root setup are cold.
A development-only branch (`process.env.NODE_ENV !== 'production'`) does not run
in production, but it must not change a production shape either: `Scope.locs`
is declared optional and never allocated in production for that reason
(`packages/octane/src/runtime.ts`, `interface Scope`).

Cite symbols, not line numbers: `runtime.ts` moves daily.

## Stable hidden classes

- **One allocation site, every field, fixed order.** `BlockImpl`, `ScopeImpl`,
  and `LiteBlockImpl` in `runtime.ts` list type-only `declare` fields and assign
  every one unconditionally in the constructor. Feature-only fields (`vt`,
  `__trySlot`, `__activitySlot`, `__warmCache`, list-item `prevSibling`,
  `nextSibling`, `key`) start as `null`, `undefined`, or `0`, so Suspense,
  Activity, ViewTransition, and list items do not fork the map. The `Block`
  interface comment on `prevSibling` records that carrying nulls everywhere
  measured better than a transition for the rare "is this an item?" case.
  `node scripts/perf-review-scan.mjs` checks this invariant mechanically.
- **`declare` fields, not runtime class fields, on hot classes.** Packages ship
  source, and a consumer may compile it with native class-field semantics, which
  defines every runtime field before the constructor runs (`BlockImpl` doc
  comment). `ScopedNode` in `signals/graph.ts` uses initializers; keep any new
  field there initialized at its declaration so all instances still share one
  layout.
- **No per-call-site keys on shared instances.** Compiled bodies keep dynamic
  per-site state in the dense `Scope.slots` array instead of
  `scope['_for$N']` string keys, which mutated the scope's hidden class per
  component (`interface Scope`, `slots`).
- **Build records with their final shape and real values.** The binding-bag
  arity factories `bag0` to `bag16` build `{ a: v0, b: v1, … }` as one literal,
  so every bag of arity N shares one hot allocation site
  (`runtime.ts`, "Binding-bag arity factories"; `compile.js` `makeBag`). Two
  literal sites that must share a class declare identical keys in identical
  order: both `ForSlot` literals declare `plainDeopt`, and `template()` declares
  `LazyTemplateRecord.root` in its literal.
- **No conditional keys.** `{ ...(flag ? { b } : {}) }` gives one site a map per
  branch. Write `{ b: flag ? b : undefined }`.
- **No `delete` on hot objects.** It moves the object to dictionary mode, with
  no enum cache. `createElement` once copied props with a spread and then ran
  `delete p.key` (894d51c608), and memo's `shallowEqualProps` measurably
  regressed until it copied without the key. `delete` stays acceptable on
  intentional dictionaries, such as hydration stashes keyed by boundary id, and
  on cold paths.
- **Freezing and redefining change the map.** `Object.freeze`,
  `Object.defineProperty`, and `Object.setPrototypeOf` give an object its own
  map. A frozen map hangs off a weak transition, so a full GC can collect it and
  deoptimize every reader in the middle of a run. `universal-core.ts` keeps
  `PINNED_HOST_BATCH_SHAPES` exemplars alive for exactly this reason. Frozen
  module-scope constants are fine.
- **Seed expandos the hot path misses.** Reading a DOM expando that a node lacks
  walks the prototype chain. The runtime seeds `$$<event>` keys on
  `Element.prototype` (`delegateEvents`, `seedExpando`, and the second trick in
  the `initDomOperations` comment).

## Monomorphic call sites and property access

- An inline cache records each receiver map it sees. Beyond four it goes
  megamorphic and falls back to a global lookup. Shared helpers that walk any
  DOM node call cached native accessors (`getFirstChild`, `getNextSibling` via
  `firstChildGetter.call(node)`), so one site does not see every Element, Text,
  and Comment map. Compiled per-template walks keep raw `firstChild` because each
  template owns its own sites (`runtime.ts`, "DOM operations bootstrap").
- Where a site is polymorphic by design, read the discriminant once into a local
  and branch on it. `unmountSlot` reads `val.__kind` once across six slot shapes.
- Keep a hot parameter's type stable. Give each arity or kind its own entry point
  instead of one function taking unions: the `bagN` factories, and the fixed-arity
  `hookMemo*` helpers, which keep cache misses free of a rest-parameter array.
- Return one shape. A hot function that returns `{ a }` on one path and
  `{ a, b }` on another, or a number on one and an object on another, makes every
  caller polymorphic. Use a same-typed sentinel instead: `Block.$$ctxDepsEpoch`
  uses `-1` so the unverified state stays in the same numeric field type.

## Field representations and elements kinds

- A field that only ever holds small integers is stored as a Smi. Writing a
  fraction, `NaN`, `-0`, or an out-of-range integer generalizes the field to a
  double or tagged representation for every object with that map, and
  deprecates the map. Keep counters, epochs, and flags integral, such as the
  `ReactiveFlags` bitmask and `revision` counter in `signals/graph.ts`, and
  `drainStamp` on `Block`. Use `-1` or `0`, not `undefined`, as a numeric
  sentinel.
- Arrays move one way: PACKED_SMI → PACKED_DOUBLE → PACKED_ELEMENTS, and any hole
  makes them HOLEY for good. The compiler assigns slot indices in the order the
  runtime writes them so `scope.slots` stays packed (`compile.js`, "Dense
  per-body slot indices"). `hookMemoCreate` uses `new Array(size).fill(null)`.
  Do not write past the end, `delete arr[i]`, or grow `length`.

## Allocation in hot loops

- Hoist closures and literals out of per-item and per-render code.
  `benchmarks/passive-scheduling` replaced one capture-free callback per batch
  with one module-level callback.
- `Array.from`, spread copies, `Object.keys` or `Object.entries`, and `for…of`
  over a `Map` or `Set` allocate on every call. Hot teardown walks intrusive lists
  instead: list items chain `head → nextSibling` (`unmountSlot`,
  `reconcileKeyed`).
- A rest parameter allocates on every call, even under Maglev. `arguments` is
  elided by Maglev and TurboFan only when it is read on a cold branch; Ignition
  and Sparkplug materialize it on entry. The HMR component `wrapper` in
  `runtime.ts` reads `arguments` only on its direct-call branch and forwards with
  `Reflect.apply(meta.fn, this, arguments)`.
- Measure allocation with `--min-semi-space-size=256 --max-semi-space-size=256`.
  Setting only the maximum lets a scavenge run mid-loop and fakes about 0 B/call.

## try/catch and function size

- Optimizing tiers handle try/catch, but a large function is less likely to be
  inlined. Keep the hot body in a small function and put the try around the call,
  as `flush` does around `flushWork`. Per-item `try` is right only when each item
  must be isolated, as `drainCallbacks` in `resize-observer.ts` isolates observer
  callbacks.
- A loop that runs once per commit can stay in Maglev for the whole run, and
  Maglev does not inline large callees. A small per-item leaf called thousands of
  times reaches TurboFan on its own. `benchmarks/client-hot-paths/functions.md`
  records which tier each large client function reached; check inlining with
  `--trace-maglev-inlining`.

## Bundle and reachability

- The client runtime is one module, and bundlers shake it by call-graph
  reachability. Naming a heavy function from a hot compiled path, even in an
  identity check such as `body === deoptItemBody`, retains its whole graph. That
  doubled every app bundle until the fact moved onto `ForSlot.plainDeopt`, set
  inside `childSlot`, which already retains that graph.
- Put feature-only code behind the capability that owns it: the nullable
  `*_DRIVER` singletons (`VIEW_TRANSITION_DRIVER?.`, `DEFERRED_LAYOUT_DRIVER?.`)
  or `HydrationCapability`. Guard hydration-only reads with the forms the
  minifier folds, `hydrating ? x : false` or `if (hydrating)`, not
  `const x = hydrating && …` (`hydration-flag.ts`).
- Mark factories `/* @__NO_SIDE_EFFECTS__ */`, as `template()` is, and
  module-scope allocations `/* @__PURE__ */`. esbuild honors
  `@__NO_SIDE_EFFECTS__` only within its own file, so the compiler stamps
  `@__PURE__` on factory calls (`compiler/pure-factories.js`).

## How to verify

Measure a production bundle. Development branches change shapes and IC
feedback. `benchmarks/runtime-object-shapes/README.md` shows the esbuild bundle
command.

- **Maps:** `%HaveSameMap(a, b)` under `--allow-natives-syntax`, as
  `benchmarks/runtime-object-shapes/run.mjs` does with its one-map-per-family
  gate. `%DebugPrint(obj)` shows the map, elements kind, and field
  representations.
- **Optimization state:** `%PrepareFunctionForOptimization(fn)`,
  `%OptimizeFunctionOnNextCall(fn)`, then `%GetOptimizationStatus(fn)` in a
  scratch harness. `benchmarks/client-hot-paths/functions.mjs` shows the pattern.
- **Deopts:** `node --trace-deopt`. Search for `for deoptimization, reason`;
  `bailout` lines miss deopts caused by a collected weak map.
- **Inline caches and maps:** `--log-ic` and `--log-maps` write `v8.log` for V8's
  system analyzer. They replaced `--trace-ic` and `--trace-maps`, which Node 24
  no longer accepts.
- **Trace output:** V8 writes traces through C stdio. Node makes a piped stdout
  non-blocking, so a slow parent loses or splits records under load and reports
  a quietly different result. Give the child a file-backed fd,
  `stdio: ['ignore', fd, 'pipe']`, as `benchmarks/client-hot-paths/functions.mjs`
  does.
- **Timing:** same-session A/B only: revert, run, reapply, run. Checked-in
  baselines drift with machine state.
