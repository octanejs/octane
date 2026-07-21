# The inline hook-memo tier (de-callbacked useMemo/useCallback + parallel-use)

Production client compiles lower the hook memo tier from runtime-callback form
to inline caches, eliminating the per-render allocations the runtime form
carries (the factory closure and the deps array, allocated on every render even
when the dependency compare hits). Dev/HMR/profile compiles, server output, and
universal-renderer units keep the runtime-callback form; the `octane-prod`
vitest project is the coverage for the inline branch. `inlineHookMemo: false`
is a diagnostic escape hatch (like `autoMemo: false`) for one-line bisection.

## Tier A — authored and auto-generated useMemo/useCallback

`const x = useMemo(fn, deps)` / `const x = useCallback(fn, deps)` declarations
in proven render-scope bodies (the `localHookSlots` numeric-slot proof) become
inline regions over a per-body flat cell array stored as a non-index property
on `__s.slots` (`_k$N` — same trick as autoMemo's `_m$N`; named properties
leave the slots array's packed elements kind alone). Layout per site:
`[initFlag, dep0..depK-1, value]`; the array is pre-sized and `.fill`ed so
conditional sites can't punch elements-kind holes.

```js
let filtered;
{
  const __hkd0 = items, __hkd1 = q;
  if (__hk[0] !== true || !Object.is(__hk[1], __hkd0) || !Object.is(__hk[2], __hkd1)) {
    __hk[3] = items.filter((x) => x.includes(q));
    __hk[1] = __hkd0; __hk[2] = __hkd1; __hk[0] = true;
  }
  filtered = __hk[3];
}
```

Contract notes:

- **Immediate publish, not autoMemo's transactional copy-on-write.** The
  runtime hooks map these regions replace publishes mid-render, and values must
  survive a later suspension in the same body — a user-authored
  `useMemo(() => fetch(id), [id])` keeps its promise identity across replay
  attempts. Publish order preserves the throw contract: value first, dep cells
  + init flag after, so a throwing factory leaves the previous entry fully
  usable.
- **Object.is compares** — byte-for-byte React/`depsChanged` semantics (NaN,
  ±0) in both compile modes.
- **useCallback allocates the closure only on a dependency miss** (and block
  bodies inline through a result local + labeled break so early returns
  survive).
- **Explicit `null` deps** = recompute every render → evaluated inline with no
  cache at all.
- Numeric-slot authored memos are unaddressable by the parallel-use warm system
  (warm caches key by Symbols), so the inline regions' lack of
  recordRealWarmMemo/adoptWarmValue interaction is observably equivalent.
- Kept on the runtime path: dev/HMR/profile, server, universal units,
  custom-hook-context bodies, non-declaration positions, multi-declarator or
  destructured declarations, non-literal-array deps, positional-deps factories,
  async/generator factories, factories containing hook-shaped calls, and block
  bodies with own-scope `var`/function declarations.

## Tier B — parallel-use creations (Symbol slots stay warm-visible)

Pass A creations (`_$useMemo(() => make(a, b), [a, b], _h$N)`) must keep their
`scope.hooks` entries: warm adoption, `activeMemoMatch` dedup, and episode
stamping all key the Symbol slot. They lower to an arity-specialized
take/publish ABI instead:

```js
let __pu$0;
{
  const __hkd0 = a, __hkd1 = b;
  __pu$0 = _$puTake2(_h$0, __hkd0, __hkd1);
  if (__pu$0 === _$puMiss) __pu$0 = _$puPub(_h$0, make(__hkd0, __hkd1), __hkd0, __hkd1);
}
```

`puTakeK` + `puPub` are exactly the runtime `useMemo` thenable path split at
the compute: same hit-side warm-episode stamping, same warm adoption before
compute, same publish tail — with zero allocations on a hit and the deps array
built only on the cold branches. Above four dependencies the runtime form is
kept (`_$useMemo` import registration is deferred to those survivors so
fully-lowered modules carry no dead specifier). `__warm` plans keep their
closure form — they only run during a suspension.

## Pass A′ — use()-fed local-const creation chains

The natural authoring shape

```tsx
const userPromise = fetchUser(id);
const thumbnailPromise = userPromise.then((u) => u.thumbnail());
return <Renderer thumbnail={use(thumbnailPromise)} />;
```

previously left `use()` with a trivial identifier argument, so nothing was
memoized: every render and every suspend-replay re-ran `fetchUser` (the
runtime's resume-replay leniency drops the fresh promise but the duplicate
request already fired), every re-render re-suspended, and the chain was
invisible to `__warm`.

A taint pre-pass (client AND server pipelines) marks local consts that
transitively feed a `use()` argument — including free identifiers of
non-trivial arguments, whose memo deps would otherwise churn — and memoizes
each creation-bearing tainted `const` at its declaration with the same
slot-keyed machinery as Pass A. Each link keeps its own Symbol slot; member
deps rooted at ANY body-local binding coarsen to that local's identity
(`userPromise.then` is `Promise.prototype.then` — identical across every
promise — so the derived link deps on `[userPromise]`; a chain hanging off an
unmemoized per-render local recomputes per render, i.e. today's behavior,
never staler). Params keep precise member paths (`props.id`). Warm-safety
automatically excludes derived links (they reference non-param locals); the
chain head joins `__warm`. Unlike React Compiler's single-region collapse,
links are memoized per-declaration — substituting an init across statements
could move its evaluation past interleaved side effects.

Scope (v1): `const`, single declarator, Identifier id, at body statement level
or inside plain if/blocks; `let` is skipped (reassignment makes the taint
unsound); eligibility reuses `isPropCreationExpr` (a call/`new` reached during
render, no JSX, no hook-shaped calls). Directive-arm-scoped consts and the
universal pipeline keep current behavior.

## Coverage

- `tests/inline-hook-memo.test.ts` + `tests/use-chain-memo.test.ts` —
  behavioral contracts, run under both vitest projects (runtime path vs inline
  path — identical expectations is the semantic-equivalence proof). The chain
  tests fail without Pass A′ (duplicate fetch on replay, refetch on unrelated
  re-render, stale derived promise on input change).
- `tests/inline-hook-memo-codegen.test.ts` — compile-mode/shape routing and
  the no-dead-import property.
- The `octane-prod` project re-runs the full hook/parallel-use/conformance
  suites against the inline branch.
