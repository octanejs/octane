# The inline hook-memo tier (de-callbacked useMemo/useCallback + parallel-use)

Production client compiles lower eligible memo hooks from runtime-callback form
to compiler-owned cache operations. A dependency hit evaluates neither the
`useMemo` factory nor a dependency-array literal; `useCallback` creates its
retained function only on a miss. This applies to `.tsrx`, returned JSX, and
eligible plain `.ts`/`.js` hook modules. Dev/HMR/profile compiles, server output,
and universal-renderer units keep their runtime hook form. `inlineHookMemo:
false` is a diagnostic escape hatch (like `autoMemo: false`) for one-line
bisection. The public hook API and explicit dependency semantics do not change.

## Tier A — authored and auto-generated useMemo/useCallback

Memo calls in proven render-scope bodies (the `localHookSlots` numeric-slot
proof) become inline regions over a per-body flat cell array stored as a non-index property
on `__s.slots` (`_k$N` — same trick as autoMemo's `_m$N`; named properties
leave the slots array's packed elements kind alone). Layout per site:
`[initFlag, dep0..depK-1, value]`; the array is pre-sized and `.fill`ed so
conditional sites can't punch elements-kind holes. Expression bodies and
single-return factories also lower in nested expressions, destructuring and
multi-declarator initializers, short-circuit branches, and value returns.

```js
let d0, d1;
const filtered =
	((d0 = items),
	(d1 = q),
	cache[0] !== true || !memoEqual(cache[1], d0) || !memoEqual(cache[2], d1)
		? publish2(
				cache,
				0,
				items.filter((x) => x.includes(q)),
				d0,
				d1,
			)
		: cache[3]);
```

The names above are illustrative. The compiler imports collision-free private
helpers from `octane/internal/client`; `memoEqual` uses the runtime's `Object.is`
intrinsic, so an authored binding named `Object` cannot change equality.
Fixed-arity publishers for zero through four dependencies also avoid creating a
rest array on an ordinary miss. Larger flat sites use the variadic cold path.

Contract notes:

- **Immediate publish, not autoMemo's render-end copy-on-write.** The
  runtime hooks map these regions replace publishes mid-render, and values must
  survive a later suspension in the same body — a user-authored
  `useMemo(() => fetch(id), [id])` keeps its promise identity across replay
  attempts. A throwing factory leaves the previous entry fully usable.
- **Held transitions own both versions.** During an active transition attempt,
  the miss-side publisher records the old and new complete site ranges in the
  same two-way journal as ordinary hook-map memos. The held screen sees its old
  promise/callback identities; promotion restores the attempted values; an
  urgent supersession of the first hold does not adopt them. Ordinary hits allocate no history. Compiler-owned
  lifetime-invariant callbacks use the same rule with a one-cell range.
- **Object.is compares** — byte-for-byte React/`depsChanged` semantics (NaN,
  ±0) in both compile modes.
- **Safe block factories** inline through a separate result local and labeled
  break. The original declaration and binding kind remain intact, including
  its temporal dead zone. Anonymous function/class results and dependencies do
  not acquire a generated temporary's inferred `.name`.
- **Explicit `null` deps** = recompute every render → evaluated inline with no
  cache at all.
- Numeric-slot authored memos are unaddressable by the parallel-use warm system
  (warm caches key by Symbols), so the inline regions' lack of
  recordRealWarmMemo/adoptWarmValue interaction is observably equivalent.
- Explicit third slots never use a private per-site flat cache: two authored
  calls may intentionally share that slot. They use the path-aware tier below.

## Tier A2 — callable helpers, custom hooks, and explicit slots

These sites must keep their ordinary `scope.hooks` entry because their effective
identity includes the caller's `withSlot` path. After normal slot assignment,
the compiler splits lookup from computation without allocating a wrapper:

```js
let dependency, slot, entry;
return (
	(dependency = value),
	(slot = memoSlot(rawSlot, 'useMemo')),
	(entry = memoTake1(slot, dependency)),
	entry === null ? memoPublish(slot, value + 1, dependency) : entry.value
);
```

`memoTake0…4` return an entry or `null`, not an arbitrary-value sentinel. Cached
`undefined`, `null`, and even the parallel-use sentinel remain valid values.
The raw slot resolves exactly once; warm adoption, warm-episode bookkeeping,
immediate publication, and held-transition ownership match runtime `useMemo`.
Dependency expressions run once, left to right, before the authored slot
expression. Explicit `null` uses `memoPublishAlways`, preserving every-render
recomputation and entry sharing.

The shared AST-only lowering covers expression positions and direct
declaration/return positions for multi-statement factories. Plain-module
production transforms use one TypeScript-preserving Program print and return a
real source map. Manually slotted modules get memo-only lowering: no new slots,
inferred dependencies, or custom-hook wrappers. Modules with imported `use()`
or unsupported specialization/printing shapes retain the existing surgical
slotting path. `octane-no-slot` remains a hard opt-out.

Both authored tiers require a known literal dependency array (no spreads or
holes), or explicit `null`. `useMemo` requires a synchronous, zero-parameter
arrow whose invocation scope can be removed. Ordinary functions retain their
own `this`, `arguments`, `new.target`, and self-name scope. Positional factories,
async/generator factories, hook-containing factories, direct eval, opaque
directives, own-scope `var`/function declarations, and block factories that
cannot be placed safely at a statement boundary keep the runtime path. The
path-aware tier currently supports up to four dependencies; flat sites have no
such arity limit. `useCallback` does not inline its returned function's body.
Any direct eval in a module disables this optimization for that module, since
even a sibling eval can observe a newly imported helper binding. Opaque
execution-directive functions retain their whole nested subtree.

The client, server, and universal runtime fallbacks also cache a callback value
directly instead of allocating an extra `() => callback` wrapper. Server and
universal compilers do not emit the new client-only cache ABI.

### Existing continuing-transition limitation

After promotion suspends on a later dependency, Octane's existing transition
machinery keeps memo entries forward so the next promotion can reuse in-flight
work. An urgent render after that second hold can therefore retain an
empty-dependency callback first created by the attempted render. This behavior
also occurs on the ordinary runtime-hook path; the inline tier preserves that
behavior rather than introducing a different cache view. Fixing it requires
selecting the committed memo view before the urgent render starts, not merely
reversing entries when the hold is discarded. That scheduler change is separate
from closure removal.

## Tier B — parallel-use creations (Symbol slots stay warm-visible)

Pass A creations (`_$useMemo(() => make(a, b), [a, b], _h$N)`) must keep their
`scope.hooks` entries: warm adoption, `activeMemoMatch` dedup, and episode
stamping all key the Symbol slot. They lower to an arity-specialized
take/publish ABI instead:

```js
let __pu$0;
{
	const __hkd0 = a,
		__hkd1 = b;
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
- `tests/compiler/inline-hook-memo-codegen.test.ts` — compile-mode/shape routing and
  the no-dead-import property.
- `tests/transitions.test.ts` — ordinary and invariant callback/promise identity
  through suspend replay, held-screen rollback, promotion, later suspension,
  and urgent supersession, including dependency arities zero through five.
- Plain-module compiler/runtime tests cover manual slots, inferred deps,
  namespace imports, source maps, declaration timing, and safety fallbacks.
- [`benchmarks/hook-memo`](../benchmarks/hook-memo/README.md) — production A/B
  semantic controls, post-tree-shaking function/array creation counters, and
  code/bundle gzip ratio guards. Counters describe source-level creation
  events, not exhaustive heap allocation or a measured latency improvement.
- The `octane-prod` project re-runs the full hook/parallel-use/conformance
  suites against the inline branch.
