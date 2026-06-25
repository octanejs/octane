# @octane-ts/query

[TanStack Query](https://tanstack.com/query) for the [octane](https://github.com/octane-ts/octane) renderer.

TanStack Query separates a framework-agnostic core (`@tanstack/query-core` — the
`QueryClient`, observers, and caches) from a React binding (`@tanstack/react-query`)
built on `useSyncExternalStore` + context. This package reuses the core verbatim and
reimplements only the binding on octane's hooks. The public surface matches
`@tanstack/react-query`, so most query code works by changing the import.

```tsx
// before
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
// after
import { QueryClient, QueryClientProvider, useQuery } from '@octane-ts/query';

const client = new QueryClient();

function Todos() @{
  const q = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });
  @if (q.isPending) { <span>loading…</span> }
  @else if (q.isError) { <span>{(q.error as Error).message as string}</span> }
  @else { <ul>{q.data as unknown}</ul> }
}

function App() @{
  <QueryClientProvider client={client}>
    <Todos />
  </QueryClientProvider>
}
```

## What's bound

- Queries: `useQuery`, `useInfiniteQuery`, `useSuspenseQuery`,
  `useSuspenseInfiniteQuery`, `useQueries`, `usePrefetchQuery`,
  `usePrefetchInfiniteQuery`
- Mutations: `useMutation`, `useMutationState`
- Status: `useIsFetching`, `useIsMutating`
- Components / context: `QueryClientProvider`, `useQueryClient`, `QueryClientContext`,
  `HydrationBoundary`, `IsRestoringProvider`, `useIsRestoring`,
  `QueryErrorResetBoundary`, `useQueryErrorResetBoundary`
- everything from `@tanstack/query-core` (`QueryClient`, `QueryCache`, observers,
  `dehydrate`/`hydrate`, …), re-exported verbatim.

The whole `@tanstack/react-query` surface is bound. The separate companion packages
(`@tanstack/react-query-persist-client`, `@tanstack/react-query-devtools`) are not
included.

## How it works

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as the last
argument of every `use*` call. The binding's hooks compose several base hooks
(`useState` for the observer, `useSyncExternalStore` to subscribe, `useEffect` for
option changes), so each forwards a distinct sub-slot derived from the one it receives.
`QueryClientProvider` is a component (it renders a context Provider + a mount effect),
so it's authored in `.tsrx`.

## Suspense & error boundaries

A query with `suspense: true` suspends, and a query/mutation with `throwOnError` throws
its error. Catch them with either octane form — the `<Suspense>` / `<ErrorBoundary>`
components or the `@try { } @pending { } @catch { }` directive:

```tsx
import { Suspense, ErrorBoundary } from 'octane-ts';

<ErrorBoundary fallback={(err) => <Oops error={err} />}>
  <Suspense fallback={<Spinner />}>
    <Profile />   {/* useQuery({ queryKey, queryFn, suspense: true }) */}
  </Suspense>
</ErrorBoundary>
```

## Persistence & error resets

`IsRestoringProvider` / `useIsRestoring` gate fetching while a persisted client is
restored, and `QueryErrorResetBoundary` / `useQueryErrorResetBoundary` coordinate
error-boundary retries with `@catch` / `<ErrorBoundary>` — call the boundary's
`reset()` alongside `useQueryErrorResetBoundary().reset()` so a `throwOnError` query
refetches instead of immediately re-throwing.
