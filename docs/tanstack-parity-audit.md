# TanStack Parity Audit — `@octanejs/router` & `@octanejs/query`

Audited 2026-07-06 against the installed upstream sources (npm ships `src/`, so this
is a diff against real upstream code, not just `.d.ts`):

- `@octanejs/router` 0.1.2 vs `@tanstack/react-router` **1.170.16** (router-core 1.171.13)
- `@octanejs/query` 0.1.2 vs `@tanstack/react-query` **5.101.0** (query-core 5.101.0)

**Verdict: neither port is fully covered.** Query is close on the runtime API
(58/58 value exports) but has zero TypeScript types, a real suspense/error-boundary
bug, and thin tests (~27). Router implements only ~36% of the upstream binding
surface (23/64 value exports), has silent correctness bugs (lifecycle events never
fire → scroll restoration never restores; errored/pending matches render anyway),
and has no differential rig despite the devDependencies for one being in place.

---

# `@octanejs/query` — GAP REPORT

**TL;DR:** The runtime value surface is **complete — 58/58 upstream runtime exports
are available** (35 via `export * from '@tanstack/query-core'` + all 23
binding-level functions/components). The implementations are faithful,
line-for-line ports in most places. The real gaps are: **(1) zero TypeScript type
surface** (every hook is typed `any`; ~41 upstream type exports missing), **(2)
`QueryErrorResetBoundary` does not support the render-prop children form**, **(3) a
suspense-error `clearReset` divergence that can break error-boundary retry**, **(4)
`HydrationBoundary` missing the streaming/promise hydration path and
transition-safe deferred hydration**, **(5) `experimental_prefetchInRender` /
`.promise` missing entirely**, and **(6) very thin test coverage (~27 tests) with
no SSR, no `combine`, no skipToken, no tracked-props tests**.

## 1. API surface coverage

### Runtime (value) exports — 58/58 covered

Upstream `@tanstack/react-query` has 58 runtime exports: 35 re-exported from
query-core + 23 binding-level. The port's `src/index.ts` re-exports core wholesale
(line 7), so all core values (`QueryClient`, `QueryCache`, `MutationCache`,
`QueryObserver`, `InfiniteQueryObserver`, `QueriesObserver`, `MutationObserver`,
`hydrate`, `dehydrate`, `focusManager`, `onlineManager`, `notifyManager`,
`timeoutManager`, `environmentManager`, `isServer`, `keepPreviousData`,
`skipToken`, `isCancelledError`, `CancelledError`, `matchQuery`, `matchMutation`,
`hashKey`, `partialMatchKey`, `replaceEqualDeep`, `shouldThrowError`,
`experimental_streamedQuery`, `dataTagSymbol`,
`defaultShouldDehydrateQuery/Mutation`, `defaultScheduler`, `noop`, `unsetMarker`,
`Query`, `Mutation`) come through. Note: at 5.101.0 core exports only
`experimental_streamedQuery` (no stable `streamedQuery` alias) — parity is correct.

All 23 binding-only runtime exports exist in the port: `useQuery`, `useQueries`,
`useSuspenseQuery`, `useSuspenseInfiniteQuery`, `useSuspenseQueries`,
`useInfiniteQuery`, `usePrefetchQuery`, `usePrefetchInfiniteQuery`, `useMutation`,
`useMutationState`, `useIsMutating`, `useIsFetching`, `useIsRestoring`,
`useQueryClient`, `useQueryErrorResetBoundary`, `queryOptions`,
`infiniteQueryOptions`, `mutationOptions`, `QueryClientProvider`,
`QueryClientContext`, `QueryErrorResetBoundary`, `HydrationBoundary`,
`IsRestoringProvider`.

The port is a slight **superset**: it also exports `IsRestoringContext` and
`QueryErrorResetBoundaryContext` (`src/index.ts:24,26`), which upstream keeps
private. Harmless but worth an intentionality check.

### Type exports — ~0/41 covered (TOP gap)

Upstream exports ~41 binding-level types; the port exports **none** (there is no
`types.ts`, and every public function is typed `any`):

- From `types.ts` (24): `UseBaseQueryOptions`, `UseQueryOptions`,
  `AnyUseQueryOptions`, `UsePrefetchQueryOptions`, `UseSuspenseQueryOptions`,
  `UseInfiniteQueryOptions`, `UseSuspenseInfiniteQueryOptions`,
  `UseBaseQueryResult`, `UseQueryResult`, `UseSuspenseQueryResult`,
  `DefinedUseQueryResult`, `UseInfiniteQueryResult`,
  `DefinedUseInfiniteQueryResult`, `UseSuspenseInfiniteQueryResult`,
  `UseMutationOptions`, `AnyUseMutationOptions`, `UseMutateFunction`,
  `UseMutateAsyncFunction`, `UseBaseMutationResult`, `UseMutationResult`,
  `AnyUseBaseQueryOptions`, `AnyUseSuspenseQueryOptions`,
  `AnyUseInfiniteQueryOptions`, `AnyUseSuspenseInfiniteQueryOptions`.
- `QueriesOptions`/`QueriesResults`, `SuspenseQueriesOptions`/`SuspenseQueriesResults`.
- `DefinedInitialDataOptions`, `UndefinedInitialDataOptions`,
  `UnusedSkipTokenOptions` + the three infinite variants.
- `QueryClientProviderProps`, `HydrationBoundaryProps`,
  `QueryErrorResetBoundaryProps`, `QueryErrorResetFunction`,
  `QueryErrorIsResetFunction`, `QueryErrorClearResetFunction`,
  `QueryErrorResetBoundaryFunction`.

Consequences beyond DX: `useQuery(...)` returns `any` (no narrowing, no
`DefinedUseQueryResult` for `initialData`), and
`queryOptions()`/`infiniteQueryOptions()`/`mutationOptions()`
(`src/queryOptions.ts:1-3` etc.) are untyped identity functions — the entire
`dataTag`-based `getQueryData` inference story upstream provides is lost. For a
"TypeScript-first" framework this is the single largest user-facing gap.
Classification: **(a) missing and needed** — all of it; nothing here is
React-specific except `React.ReactNode` in prop types (trivially substitutable).
The port's `QueryErrorResetBoundaryValue` interface exists
(`src/errorResetBoundary.ts:3`) but isn't re-exported from `index.ts`.

### Spot-check of existing implementations vs upstream source

- **`useBaseQuery`** (`src/useBaseQuery.ts`) — faithful: defaulted options,
  `_optimisticResults` incl. `subscribed:false` passive mode (l.33-38),
  `ensureSuspenseTimers` (l.40), `ensurePreventErrorBoundaryRetry` (l.43),
  clear-reset effect (l.45-51), observer in `useState` (l.53),
  `getOptimisticResult` before `useSyncExternalStore` (l.55),
  `notifyManager.batchCalls` + `observer.updateResult()` in subscribe (l.58-73),
  `setOptions` effect (l.75-81), suspense → error-throw ordering (l.88-104),
  `trackResult` unless `notifyOnChangeProps` (l.106). Missing vs upstream
  `useBaseQuery.ts`:
  - **`experimental_prefetchInRender` / `result.promise`** (upstream l.153-168 +
    the `isNewCacheEntry` probe l.91-94): completely absent. `useQuery().promise`
    will exist on the result object (core puts it there) but never finalizes
    correctly without the `updateResult()` wiring. Also
    `ensurePreventErrorBoundaryRetry` in the port (`src/internal.ts:62`) omits
    upstream's `options.experimental_prefetchInRender` condition
    (`errorBoundaryUtils.ts:37`).
  - Dev-mode "Bad argument type" object-form check (upstream l.44-50) and "No
    queryFn" console.error (upstream l.69-75): absent.
  - `_experimental_beforeQuery`/`_experimental_afterQuery` client hooks (upstream
    l.56-58, 148-151): absent — these are used by devtools/integrations.
  - **Suspense fetch catch:** port does
    `use(observer.fetchOptimistic(defaultedOptions).catch(noop))`
    (`src/useBaseQuery.ts:89`); upstream's `fetchOptimistic` catches with
    `errorResetBoundary.clearReset()` (`suspense.ts:78-80`). Behavioral
    consequence: after a boundary `reset()` triggers a retry that fails again,
    upstream clears the reset flag so `getHasError` re-throws to the boundary; in
    the port `isReset()` stays `true` at replay, `getHasError` returns `false`,
    and a suspense component can fall through to render with `undefined` data
    (violating `useSuspenseQuery`'s data guarantee) or wedge the retry loop. Same
    issue in `useQueries` (`src/useQueries.ts:89`). **Real bug-class divergence.**
- **`useQueries`** (`src/useQueries.ts`) — faithful otherwise: `combine` is
  forwarded via `restOptions` into the observer and
  `getOptimisticResult(defaultedQueries, restOptions.combine)` (l.54-57), tracked
  results via `getCombinedResult(trackResult())` (l.115), memoized defaulted
  queries with the same deps (l.23-32), per-query suspense with fresh
  `QueryObserver` + `Promise.all` (l.85-96). Only the `clearReset` catch gap above.
- **`useMutation`** (`src/useMutation.ts`) — matches upstream exactly (stable
  `mutate` via `useCallback([observer])`, `mutateAsync: result.mutate`,
  `shouldThrowError` throw, l.49-61). No stale-closure risk (observer holds latest
  options via the `setOptions` effect, same as upstream). Note it duplicates a
  private `subSlot` copy (l.11-20) identical to `internal.ts` — harmless drift
  hazard.
- **`useMutationState` / `useIsMutating`** (`src/useMutationState.ts`) — matches
  upstream, including the `replaceEqualDeep` + `notifyManager.schedule`
  structural-sharing subscription and the every-render `optionsRef` effect.
- **`useIsFetching`** (`src/useIsFetching.ts`) — matches.
- **`usePrefetchQuery`/`usePrefetchInfiniteQuery`** (`src/usePrefetch.ts`) —
  matches upstream runtime exactly.
- **`useSuspenseQuery`/`useSuspenseInfiniteQuery`** (`src/useSuspenseQuery.ts`) —
  forces `enabled:true, suspense:true, throwOnError:defaultThrowOnError`;
  `placeholderData:undefined` forced for the non-infinite variant (upstream
  `useSuspenseInfiniteQuery.ts` also doesn't force it — parity OK). Missing: the
  dev `skipToken` console.error present upstream in **both** `useSuspenseQuery`
  (upstream l.17-21) and `useSuspenseInfiniteQuery`; the port only has it in
  `useSuspenseQueries` (`src/useSuspenseQueries.ts:10-12`).
- **`HydrationBoundary`** (`src/HydrationBoundary.ts`) — simplified; two real gaps
  vs upstream `HydrationBoundary.tsx`:
  1. **No streaming-hydration condition** (upstream l.75-83): upstream also treats
     a dehydrated query as "newer" when it carries a `promise` and
     `dehydratedAt > existing.dataUpdatedAt` (dehydrated-pending-promise
     streaming, i.e. `dehydrate` with pending queries). The port only compares
     `dataUpdatedAt` (`HydrationBoundary.ts:21`), so later stream chunks never
     re-hydrate an already-settled query. Streaming SSR hydration is partially
     broken.
  2. **Existing-query hydration happens in render, not deferred to an effect**
     (upstream l.97-108 defers `existingQueries` to `useEffect` specifically so an
     *aborted transition* doesn't clobber currently-committed data). The port's
     comment (l.9-12) claims sync rendering makes render-phase hydration
     sufficient — but octane *has* transitions (the package even tests transition
     holds), so hydrating existing observers mid-transition-render diverges from
     upstream's abort-safety. At minimum this deserves a documented-divergence
     note or a test.
- **`QueryClientProvider` / `useQueryClient` / contexts**
  (`src/QueryClientProvider.tsrx`, `src/context.ts`) — match (mount/unmount
  effect, explicit-client-wins resolution).
- **`QueryErrorResetBoundary`** (`src/QueryErrorResetBoundary.tsrx:11-13`) —
  **does not support the render-prop form**: upstream renders
  `typeof children === 'function' ? children(value) : children`
  (`QueryErrorResetBoundary.tsx:53`). The documented primary usage
  `<QueryErrorResetBoundary>{({ reset }) => <ErrorBoundary onReset={reset}…/>}</QueryErrorResetBoundary>`
  won't work; port users must call `useQueryErrorResetBoundary()` inside. Missing
  user-facing API shape.
- **`IsRestoringProvider`** — matches.

### Classification summary

| Missing item | Class |
|---|---|
| ~41 type exports / typed signatures | (a) missing & needed |
| `QueryErrorResetBoundary` render-prop children | (a) missing & needed |
| suspense `clearReset` on fetch error | (a) bug-class divergence |
| HydrationBoundary streaming/`dehydratedAt` path | (a) missing & needed for streaming SSR |
| HydrationBoundary deferred existing-query hydration | (a)/(b) — needs decision given octane transitions |
| `experimental_prefetchInRender` + `.promise` finalization | (a), experimental tier |
| `_experimental_beforeQuery/afterQuery` | (a), devtools tier |
| dev warnings (bad-arg, no-queryFn, skipToken in useSuspenseQuery) | (a), dev-only, cheap |
| React-specific: none found — nothing upstream is RSC/StrictMode-bound in the binding | (b) n/a |
| Deprecated upstream exports omitted | none — v5 surface is clean |

## 2. Feature/behavior coverage

- **Suspense flows** — Implemented via octane's `use(thenable)` instead of
  `throw promise` (`useBaseQuery.ts:83-90`, `useQueries.ts:80-96`) — a deliberate,
  documented adaptation. `useSuspenseQuery` correctly forces
  `enabled/suspense/throwOnError` and strips `placeholderData`. Gap: the
  `clearReset` catch divergence (above), and `shouldSuspend` is inlined in
  `useBaseQuery` but shared in `internal.ts:69` for `useQueries` (equivalent
  logic).
- **throwOnError / error boundaries** — `getHasError` and
  `ensurePreventErrorBoundaryRetry` are verbatim ports (`src/internal.ts:53-95`);
  thrown errors integrate with octane's `@try/@catch`. Works; tested once
  (`tests/conformance/boundaries.test.ts:52-67`).
- **SSR + hydration** — `hydrate`/`dehydrate` come from core; `HydrationBoundary`
  works for the settled-data case but not streamed/pending dehydration (above).
  There are **zero server-render tests** — nothing verifies `useQuery` inside
  octane's `render()`/`hydrateRoot()` path (getServerSnapshot arm of
  `useSyncExternalStore`, `isServer` behavior). Given the octane repo has a whole
  `hydration/` suite for the runtime, the binding has no analogue.
- **Transitions** — Genuinely strong:
  `tests/conformance/transition-suspense.test.ts` pins React's "no fallback flash
  across a transition re-suspend" contract with MutationObserver-based flash
  detection (2 tests), including the urgent-key-change-while-held case. This is
  better than most ports manage.
- **isRestoring / persistence** — Context + passive
  `_optimisticResults='isRestoring'` + no-subscribe path implemented
  (`useBaseQuery.ts:34-38,57`) and tested both ways (`boundaries.test.ts:24-50`).
  No test for the restore-*finishing* transition (flip `restoring` true→false and
  observe the fetch start). Note there is no octane port of
  `@tanstack/react-query-persist-client` (`PersistQueryClientProvider`) — arguably
  out of scope for this package, but it's the only real consumer of
  `IsRestoringProvider`.
- **notifyManager batching vs octane scheduler** — subscriptions wrap callbacks in
  `notifyManager.batchCalls` exactly like upstream; no
  `notifyManager.setBatchNotifyFunction` bridge to octane's batcher (upstream v5
  doesn't set one for React either — uSES absorbs it). Reasonable; untested (no
  "two queries settle in one macrotask → one render" assertion).
- **Structural sharing + tracked props** — delegated to core's `trackResult`
  (`useBaseQuery.ts:106`) and `getCombinedResult(trackResult())`
  (`useQueries.ts:115`), with the `notifyOnChangeProps` opt-out — correct wiring.
  **Untested**: no test asserts a component reading only `data` doesn't re-render
  on an `isFetching`-only change.
- **skipToken** — available via core re-export; dev-guarded only in
  `useSuspenseQueries`; **no test** uses it.
- **Prefetch hooks** — parity; only `usePrefetchQuery` tested.
- **`combine` in useQueries** — implemented and forwarded correctly, **untested**
  (the fixture named "combines" (`tests/_fixtures/followups.tsrx:31-44`) just
  `.map()`s results; the `combine` option is never exercised).
- **defaultOptions from provider/client** — `client.defaultQueryOptions(options)`
  used everywhere; untested explicitly.

## 3. Test coverage

**~27 tests total** across 7 conformance files + 1 differential test. Upstream
react-query's own suite is thousands of tests (useQuery alone is hundreds). What
exists is well-chosen smoke + one deep transition suite, but breadth is thin.

Per file:

| File | Tests | Covers |
|---|---|---|
| `conformance/exports.test.ts` | 2 | 4 binding exports exist; option helpers are identity. (Does NOT diff the full 58-export surface against real react-query — easy win to add.) |
| `conformance/query.test.ts` | 4 | useQuery pending→success, pending→error; useQueryClient via provider; useMutation idle→pending→success |
| `conformance/boundaries.test.ts` | 3 | isRestoring blocks fetch / normal fetch; QueryErrorResetBoundary reset→retry (throwOnError:true) |
| `conformance/suspense.test.ts` | 4 | suspense query fallback→data, error→@catch, octane `<Suspense>` component, useSuspenseQueries (2 queries) |
| `conformance/followups.test.ts` | 7 | useInfiniteQuery first page only; useQueries (2 queries, no combine); useIsFetching 1→0; useIsMutating 0→1→0; usePrefetchQuery; HydrationBoundary basic hydrate; useSuspenseQuery |
| `conformance/extra.test.ts` | 4 | key change → refetch; unmount unsubscribes observer; explicit-client (no provider); provider mount/unmount counts |
| `conformance/transition-suspense.test.ts` | 2 | Deep React-parity: transition holds committed content across async urgent re-suspends, MutationObserver flash detection |
| `differential/parity.test.ts` | 1 | One fixture (`cached-diff.tsrx`): synchronous `initialData` + `staleTime:Infinity` query, single mount step, byte-equal rendered result shape vs real React+react-query |

**Differential rig** (`differential/_setup.ts`): compiles the same `.tsrx` via
`@tsrx/react`, rewrites `@octanejs/query`→`@tanstack/react-query` and
`octane`→`react`, and compares `innerHTML` per step. What it proves: the octane
binding produces the identical *result-object shape* as react-query for the
covered fixture. What it **cannot** see: anything async-timed (it currently only
covers a synchronous query — no pending→success step-through), effect timing,
number of re-renders (tracked-props efficiency), focus/online refetch, suspense
fallback timing, DOM move patterns. With one sync fixture, the differential suite
is currently a shape-check, not a behavior proof.

**Behavior-area coverage map** (vs upstream's own test areas):

| Upstream test area | Port coverage |
|---|---|
| useQuery (lifecycle, keys, enabled, select, placeholderData, initialData, refetch, invalidation, retry, focus/online, structuralSharing, notifyOnChangeProps…) | **Thin** — 6-7 tests hit lifecycle/keys/unmount/client-resolution + 1 differential initialData; everything else untested at binding level |
| useQueries | **Thin** (1; `combine` untested) |
| useMutation (callbacks, mutate vs mutateAsync, reset, throwOnError, scope) | **Thin** (1 lifecycle) |
| useInfiniteQuery (fetchNextPage/PreviousPage, maxPages, direction) | **Thin** (1; first page only — `fetchNextPage` never called in any test) |
| useSuspenseQuery / useSuspenseQueries | **Moderate** (4 + 2 transition tests — the strongest area) |
| useSuspenseInfiniteQuery | **None** |
| usePrefetchQuery / usePrefetchInfiniteQuery | Thin (1) / **None** |
| useIsFetching | Thin (1) |
| useMutationState (filters, select) | **None directly** (only via useIsMutating) |
| HydrationBoundary (newer/older data, promises, options, mutations) | **Thin** (1 happy path) |
| QueryClientProvider | Moderate (for its size) |
| QueryErrorResetBoundary | Thin (1; render-prop form untestable — unsupported) |
| ssr / streaming hydration | **None** |
| Suspense error/retry loop (reset→fail again) | **None** (exactly where the `clearReset` divergence hides) |
| Tracked props / render-count efficiency | **None** |
| skipToken | **None** |

## Ranked findings (query)

1. **No TypeScript types at all** — ~41 binding type exports missing; all hooks
   return `any`; `queryOptions` dataTag inference lost. (`src/index.ts`, no
   `types.ts`.)
2. **`QueryErrorResetBoundary` render-prop children unsupported** — documented
   upstream usage pattern breaks. (`src/QueryErrorResetBoundary.tsrx:11-13` vs
   upstream `QueryErrorResetBoundary.tsx:53`.)
3. **Suspense fetch error doesn't `clearReset()`** — `.catch(noop)` at
   `src/useBaseQuery.ts:89` and `src/useQueries.ts:89`; breaks the
   reset→retry→fail-again error-boundary contract; the exact scenario has no test.
4. **`HydrationBoundary` missing streaming (`promise`/`dehydratedAt`) hydration
   and transition-safe deferred hydration** — `src/HydrationBoundary.ts:19-27` vs
   upstream `HydrationBoundary.tsx:75-108`.
5. **`experimental_prefetchInRender` / `useQuery().promise` unimplemented** —
   `src/useBaseQuery.ts` (no equivalent of upstream l.153-168);
   `src/internal.ts:62` misses the condition too.
6. **Test breadth**: ~27 tests; zero SSR/hydration-boundary-on-server tests, zero
   `combine`/skipToken/tracked-props/fetchNextPage/useMutationState-select tests;
   differential suite is a single synchronous fixture. The `exports.test.ts`
   should diff the full export surface against the real react-query module
   (trivial and would lock the 58/58 parity in).
7. Dev-mode warnings missing (`Bad argument type`, no-queryFn, skipToken in
   `useSuspenseQuery`/`useSuspenseInfiniteQuery`) and
   `_experimental_beforeQuery/afterQuery` devtools hooks absent — low priority,
   cheap to add.
8. Minor: port publicly exports `IsRestoringContext`/`QueryErrorResetBoundaryContext`
   (upstream doesn't); `useMutation.ts:11-20` duplicates `internal.ts`'s `subSlot`.

**What's genuinely solid:** 58/58 runtime export parity; near-verbatim ports of
`useBaseQuery`/`useQueries`/`useMutation`/`useMutationState` logic including
tracked results, passive `subscribed:false`, isRestoring gating, and
`notifyManager` batching; and the transition-suspense conformance tests, which pin
a React behavior most ports never verify.

---

# `@octanejs/router` — GAP REPORT

**Headline: 23 of 64 upstream binding-level value exports are implemented
(~36%).** Of the 41 missing, 5 are deprecated upstream and 2 are React-internal
shims, leaving **34 substantive missing exports**. Several exports that do exist
are materially simplified (Link, Match rendering pipeline, Transitioner). The
router **event lifecycle (`onRendered`/`onResolved`/`onLoad`) is never emitted,
which silently breaks scroll-restoration restore**. There is **no differential
test rig** against real `@tanstack/react-router`, despite it being in
devDependencies and the repo having that pattern in
`packages/base-ui/tests/differential`.

The port's own header (src/index.ts:13-17) declares a v1 scope that defers
file-based routing, devtools, search middleware, useBlocker, ScrollRestoration,
Await/streaming, and lazy routes — but ScrollRestoration, Await, and
lazyRouteComponent were in fact built, so the comment is stale in both directions.

## 1. API surface coverage

### 1a. Core re-exports (covered wholesale)

`src/index.ts:18` does `export * from '@tanstack/router-core'`, which re-exports
**all** core values (`defer`, `redirect`/`isRedirect`, `notFound`/`isNotFound`,
`retainSearchParams`, `stripSearchParams`, `createSerializationAdapter`, `lazyFn`,
`SearchParamError`, `createRouterConfig`, `DEFAULT_PROTOCOL_ALLOWLIST`,
`composeRewrites`, path utils, search serializers, etc.) **and all core types**
(`AnyRoute`, `RouteOptions`, `NavigateOptions`, `LinkOptions`, `Register`,
`ErrorComponentProps`, `NotFoundError`, validator types, etc.). This is broader
than upstream's curated list — fine for users, though it also leaks core internals
upstream deliberately hides. History values (`createHistory`,
`createBrowserHistory`, `createHashHistory`, `createMemoryHistory`) are
re-exported (index.ts:19-24). **Gap:** history *types* (`RouterHistory`,
`HistoryLocation`, `HistoryState`, `BlockerFn`, `ParsedPath`) are only on the
`@octanejs/router/history` subpath (src/history.ts:10), not the main entry as
upstream has them.

### 1b. Present (23)

`createRouter`, `Router`, `createRoute`, `createRootRoute`,
`createRootRouteWithContext`, `Route`, `RootRoute`, `useRouter`, `useRouterState`,
`useLocation`, `useParams`, `useSearch`, `useLoaderData`, `useMatches`,
`useNavigate`, `useAwaited`, `lazyRouteComponent`, `RouterProvider`, `Outlet`,
`Link`, `Navigate`, `Await`, `ScrollRestoration`. Octane-specific extras not in
upstream's index: `routerContext`, `getRouterContext`, `matchContext`, `useStore`
(upstream users get `useStore` from `@tanstack/react-store`).

### 1c. Missing — (a) needed, ranked by impact

| Export | Notes |
|---|---|
| `useMatch` | The foundational match hook (`from`/`strict`/`shouldThrow`/`select`). Port's hooks bypass it entirely. |
| **`Route` class hook accessors** | Upstream `Route`/`RootRoute` carry `route.useParams/useSearch/useLoaderData/useLoaderDeps/useMatch/useRouteContext/useNavigate` (upstream route.tsx:109-140). Port's `class Route extends BaseRoute {}` (src/route.ts:8) adds **nothing** — this extremely common pattern (`Route.useLoaderData()`) is absent. |
| `useRouteContext` | No way to read `beforeLoad`/context values at all. |
| `useLoaderDeps` | Missing. |
| `getRouteApi` (+ deprecated `RouteApi`) | Widely used, incl. code-based routing. |
| `CatchBoundary`, `ErrorComponent`, `CatchNotFound`, `DefaultGlobalNotFound` | No error-boundary surface exported (and none used internally — see §2). |
| `useBlocker`, `Block` | Navigation blocking entirely absent (declared deferred, index.ts:17). |
| `useLinkProps`, `createLink`, `linkOptions` | `createLink` is the standard way UI libraries integrate; `linkOptions` is a trivial identity fn. |
| `Matches`, `Match`, `useMatchRoute`, `MatchRoute`, `useParentMatches`, `useChildMatches` | `Matches`/`Match` exist internally (src/Matches.tsrx, src/Match.tsrx) but aren't exported; the other three don't exist. |
| `useCanGoBack` | Trivial (`location.state.__TSR_index !== 0`) but missing. |
| `createRouteMask` | Route masking cannot be configured (and Link ignores masks anyway, §2). |
| `createFileRoute`, `createLazyFileRoute`, `createLazyRoute`, `LazyRoute` | File-based routing + route-level code splitting. Deliberately deferred (index.ts:16), but without `createFileRoute` the `@tanstack/router-plugin` codegen ecosystem cannot target octane at all. |
| `RouterContextProvider` | Provide router context without rendering matches. |
| `useElementScrollRestoration` | Missing. |
| `ClientOnly`, `useHydrated` | Needed for SSR apps. |
| SSR head/body management: `HeadContent`, `Scripts`, `Asset`, `ScriptOnce`, `useTags` | Missing, plus the entire `./ssr/server` and `./ssr/client` subpath entries (`RouterServer`, `RouterClient`, `renderRouterToString/Stream`, `defaultStreamHandler`, serializer). The port's package.json exposes only `.` and `./history`. |

(b) **Intentionally out of scope / React-specific:** `reactUse`,
`useLayoutEffect` (React-18 shims; octane has native `use`/`useLayoutEffect`),
`index.rsc.ts` RSC entry, StrictMode-related behavior. (c) **Deprecated upstream
(safe to skip):** `FileRoute` (fileRoute.ts:65), `FileRouteLoader`
(fileRoute.ts:161), `rootRouteWithContext` (route.tsx:466), `NotFoundRoute`, and
`RouteApi` *class* (route.tsx:103; the `getRouteApi` fn is NOT deprecated). Note
`ScrollRestoration` is deprecated upstream (ScrollRestoration.tsx:18) in favor of
the `scrollRestoration` router option — the port ships both, correctly.

### 1d. Missing types + typing quality

All react-binding-local types are absent: `LinkProps`, `LinkComponent`,
`LinkComponentProps`, `CreateLinkProps`, `ActiveLinkOptions`,
`UseLinkPropsOptions`, `AwaitOptions`, `RouterProps`, `RouteComponent`,
`ErrorRouteComponent`, `NotFoundRouteComponent`, `AnyRootRoute`,
`AsyncRouteComponent`, `UseMatchRouteOptions`, `MakeMatchRouteOptions`,
`UseBlockerOpts`, `ShouldBlockFn`, and the `typePrimitives` validators
(`ValidateLinkOptions` etc.). More fundamentally, **the port's own surface is
untyped**: `createRoute(options: any): any` (src/route.ts:11),
`createRouter(options: any): any` (src/router.ts:61), hooks are
`(...args: any[]): any` (src/hooks.ts). TanStack Router's flagship feature —
end-to-end route type inference via `Register` — is nominally re-exported from
core but **cannot work** through these `any`-typed factories. This is arguably the
single largest DX gap.

## 2. Feature/behavior coverage

### TOP: router lifecycle events never fire → scroll-restoration restore is broken

Upstream `Transitioner` (Transitioner.tsx:86-127) emits `onLoad`,
`onBeforeRouteMount`, `onResolved`, sets `status: 'idle'`, and commits
`resolvedLocation`; upstream `OnRendered` in Match.tsx emits `onRendered`. The
octane Transitioner (src/Transitioner.tsrx, 29 lines) does **none of this** — it
only wires `startTransition`, history subscribe, and initial `load()`.
Consequences:

- router-core's `setupScrollRestoration` restores scroll **on `onRendered`**
  (router-core scroll-restoration.js:121) — never emitted, so **scroll positions
  are saved but never restored**. Both the `scrollRestoration: true` option
  (src/Matches.tsrx:18-20) and `<ScrollRestoration/>` are affected. The port's
  test only asserts "mounts + navigation still works" (features.test.ts:38) so
  this is invisible to the suite.
- `router.stores.resolvedLocation` is never updated → `useRouterState` selectors
  on `resolvedLocation`, pending-location UI, and any
  `router.subscribe('onResolved'|'onRendered'|'onLoad'|...)` consumer (incl.
  future devtools) are dead.
- Upstream's mount-time canonical-URL check (`commitLocation({replace:true})`,
  Transitioner.tsx:39-56) and SSR-hydration load guard (`router.ssr` skip,
  Transitioner.tsx:65-70) are absent — hydration would re-run `router.load()`.

### TOP: no error boundaries in the match pipeline

`Match.tsrx:10` says "Error boundaries arrive next" — they haven't. There is no
`CatchBoundary`, no `route.options.errorComponent` / `defaultErrorComponent` /
`onCatch` / `defaultOnCatch` handling, no reset-on-navigation (`loadedAt`
resetKey), and **`match.status === 'error'` is simply not branched on**
(src/Match.tsrx:26-34) — an errored match falls through to rendering its component
as if nothing happened. Render-thrown `notFound()` is also uncaught (upstream's
`CatchNotFound` boundary, Match.tsx `ResolvedNotFoundBoundary`); only
loader-thrown notFound (status `'notFound'`) works.

### TOP: pending/redirect match states not implemented

Upstream `MatchInner` throws `loadPromise` for `status === 'pending'` (with
`pendingMinMs`/`minPendingPromise`, `_forcePending`, `_displayPending` handling)
and for `status === 'redirected'`. The port's Match throws nothing — so
`pendingMs`/`pendingMinMs`/`defaultPendingMs`/`defaultPendingMinMs` are inert, a
pending match renders its component with `loaderData === undefined`, and an
in-flight redirect observed mid-render isn't suspended on. The port's `@pending`
boundary + transition-based concurrent hold (src/router.ts:19-53, well-commented
and tested) covers the *suspending component* path, but not the *loader-driven*
pending path that upstream guarantees. Also missing in Match: `defaultComponent`
fallback (only `route.options.component`, src/Match.tsrx:21),
`remountDeps`/`defaultRemountDeps` keying, root `shellComponent`,
`Wrap`/`InnerWrap` (upstream RouterProvider.tsx:44-46, 71-75),
`disableGlobalCatchBoundary`, and the deprecated `notFoundRoute` root fallback.

### TOP: Link is a minimal subset

src/Link.tsrx (95 lines vs upstream link.tsx 983):

- **No preloading whatsoever** — no `preload` ('intent'/'viewport'/'render'),
  `preloadDelay`, `preloadIntentProximity`; `defaultPreload`/`defaultPreloadDelay`
  router options are inert. No IntersectionObserver viewport preload, no
  touchstart/focus intent. (Admitted at Link.tsrx:5.)
- Props not forwarded to `buildLocation`/`navigate`: `state`, `from`, `mask`,
  `resetScroll`, `hashScrollIntoView`, `viewTransition`, `startTransition`,
  `ignoreBlocker`, `unsafeRelative` (Link.tsrx:20-25, 74-80). Relative-`from`
  links and **route masking are broken through Link** (href uses `next.href`,
  never `maskedLocation.publicHref`).
- Active-state divergences: search compared by raw `searchStr` equality
  (Link.tsrx:32) vs upstream's partial `deepEqual` subset match; `exact:false`
  uses bare `startsWith` (Link.tsrx:30) → `/about` marks `/about-us` active; no
  trailing-slash normalization (`exactPathTest`); no
  `data-status="pending"`/`isTransitioning` state.
- No children-as-function render prop (`{({ isActive }) => ...}`).
- `disabled` keeps `href` and stays focusable (Link.tsrx:90) vs upstream removing
  `href` + `role="link"`.
- No external-URL detection or dangerous-protocol (`javascript:`) blocking
  (upstream link.tsx:120-135 + `DEFAULT_PROTOCOL_ALLOWLIST`) — a
  **security-relevant** gap.

### Other behavioral gaps

- **Hooks resolve `from` wrongly relative to render position**: `matchFor`
  (src/hooks.ts:9-12) uses the **last** match in `state.matches` when no `from` is
  given, whereas upstream resolves the **nearest enclosing match via
  `matchContext`** — a layout component calling `useSearch()`/`useParams()` gets
  the *leaf* route's values in the port. No `strict`, no `shouldThrow`, silent
  fallback instead of upstream's invariant.
- **No structural sharing**: upstream `useStructuralSharing`
  (`replaceEqualDeep` + `structuralSharing` opt + `defaultStructuralSharing`
  router option) has no counterpart; `useStore` compares with `Object.is` only
  (src/useStore.ts:20).
- `useNavigate` returns a **new function every render** (src/hooks.ts:86) vs
  upstream's stable `useCallback` — breaks memo/effect deps.
- **SSR/streaming**: no server entry, no `RouterServer`/`RouterClient`, no
  dehydration/hydration wiring, no `HeadContent`/`Scripts` head management, no
  `ScriptOnce`. The store factory has a server branch (src/router.ts:41-47) so
  plain renderToString may work, but nothing is tested or exposed.
- **Search middleware / validation**: `retainSearchParams`/`stripSearchParams`/
  `validateSearch` come from core and should function, but zero tests exercise
  them.
- **View transitions**: handled inside router-core's commit, and the store-factory
  comment (router.ts:26-39) shows real care here — but `Link viewTransition` prop
  isn't forwarded, and nothing is tested.
- Router-binding options inert because their consumers are missing:
  `defaultComponent`, `defaultErrorComponent`, `defaultOnCatch`,
  `defaultPendingMs`, `defaultPendingMinMs`, `defaultPreload`,
  `defaultPreloadDelay`, `defaultStructuralSharing`, `defaultRemountDeps`, `Wrap`,
  `InnerWrap`, `disableGlobalCatchBoundary`. `RouterProvider` also ignores extra
  props (upstream calls `router.update({...rest})`, RouterProvider.tsx:28-36).

Things done **well** (for fairness): the store-factory seam + `startTransition`
commit wrapping is thoughtful and octane-idiomatic (src/router.ts:19-53);
not-found resolution order matches upstream including fuzzy/root modes and
`notFound({data})` prop spreading (src/RouteNotFound.tsrx); `lazyRouteComponent`
includes the stale-chunk sessionStorage reload recovery
(src/lazyRouteComponent.ts:28-40); `useStore`'s selector memoization correctly
emulates `useSyncExternalStoreWithSelector`.

## 3. Test coverage

### What exists (7 files, ~20 `it`s, all in `tests/conformance/`)

- `router.test.ts` — layout Outlet render, navigation swap, Link click + active
  state, useParams, nested Outlet chain (5 its).
- `parity.test.ts` — **dialect** parity: the same octane app authored `.tsrx` vs
  React-style `.tsx` (fixtures `basic.tsrx` / `basic-react.tsx` — both import
  `@octanejs/router`). This is *not* a comparison against real TanStack Router.
- `not-found.test.ts` — the strongest file: root/route/default/generic fallback,
  fuzzy vs root mode, loader `notFound()` with data, unknown→known round-trip
  (7 its).
- `concurrent-navigation.test.ts` — transition hold across suspending route
  (2 its).
- `same-route-search.test.ts` — concurrent hold on `?page` change (1 it).
- `link-passthrough.test.ts` — arbitrary prop forwarding;
  `reloadDocument`/`disabled` non-interception (2 its).
- `features.test.ts` — lazyRouteComponent, Await deferred resolve,
  scrollRestoration **smoke only** (3 its).

### Untested behaviors that DO exist

Upstream's suite (from the repo, `packages/react-router/tests/`) includes:
`link.test.tsx` (thousands of lines: preload intent/viewport, active options,
masks, external links, protocol blocking), `useNavigate.test.tsx`,
`useBlocker.test.tsx`, `useMatch.test.tsx`, `useParams.test.tsx`,
`useSearch.test.tsx`, `useLoaderData/useLoaderDeps/useRouteContext`,
`scroll-restoration.test.tsx`, `route.test.tsx`, `router.test.tsx` (redirects,
beforeLoad, context), `Matches/useMatchRoute`, `ClientOnly.test.tsx`,
`Scripts/HeadContent.test.tsx`, `awaited.test.tsx`, navigation blocking, ssr
tests. Mapped to the port, **untested behaviors that DO exist** include:
`useLoaderData` (never asserted anywhere), `useSearch`/`useLocation`/
`useMatches`/`useRouterState` selectors, `Navigate` component, history
back/forward (`history.subscribe → load`), replace navigation, loader
`redirect()`, `beforeLoad` context, `validateSearch`/search middleware, hash
handling, basepath, memory vs browser history, `activeProps`/`inactiveProps`
(implemented in Link.tsrx:35 but untested), SSR/hydration (repo has a `hydration/`
pattern in `packages/octane/tests`; router has none).

### Differential rig: absent — flag

`packages/router/tests/` contains only `conformance/`, `_fixtures/`,
`_helpers.ts`. There is **no `differential/` rig** running the same fixture
through octane and real `@tanstack/react-router` with byte-equal HTML assertions,
even though (a) the repo's gold-standard pattern exists at
`packages/base-ui/tests/differential/parity.test.ts` (and
`packages/query/tests/differential`), and (b) `@tanstack/react-router`, `react`,
`react-dom`, and `@tsrx/react` are already declared in
`packages/router/package.json` devDependencies — strongly suggesting the rig was
planned but never built. The existing `parity.test.ts` name is misleading: it
proves tsrx/tsx *authoring* equivalence, not upstream behavioral parity. Given how
many Link/Match behaviors diverge (§2), a differential rig would immediately
surface most of them; its absence is the **top test gap**.

## Recommended priority order (router)

1. Emit the router lifecycle events + commit `resolvedLocation` in
   Transitioner/Match (fixes scroll-restoration restore, unblocks devtools) —
   currently a silent correctness bug.
2. Error boundaries in Match (octane `@try/@catch` maps naturally) +
   `status: 'error' | 'redirected' | 'pending'` handling and
   `ErrorComponent`/`CatchBoundary`/`CatchNotFound` exports.
3. `useMatch`/`useRouteContext`/`useLoaderDeps`/`useCanGoBack` + Route-class hook
   accessors + `getRouteApi`, and fix nearest-match (`matchContext`) resolution in
   existing hooks.
4. Link parity: preloading, `state/from/mask` forwarding, protocol blocking,
   active-state `deepEqual`/`exactPathTest`, render-prop children; then
   `useLinkProps`/`createLink`/`linkOptions`.
5. Build the differential test rig against real `@tanstack/react-router`.
6. `useBlocker`/`Block`, `useMatchRoute`/`MatchRoute` + Matches/Match exports,
   structural sharing, typed public surface, then SSR entries + `createFileRoute`.
