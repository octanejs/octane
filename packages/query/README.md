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

- `QueryClientProvider`, `useQueryClient`, `QueryClientContext`
- `useQuery`, `useMutation`
- everything from `@tanstack/query-core` (`QueryClient`, `QueryCache`, observers, …),
  re-exported verbatim.

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

## Not yet ported

`useInfiniteQuery`, `useQueries`, `useSuspenseQuery`/`useSuspenseInfiniteQuery`,
`useIsFetching`/`useIsMutating`, `useMutationState`, and the persistence/streaming
helpers (`IsRestoring`, hydration). Contributions welcome.
