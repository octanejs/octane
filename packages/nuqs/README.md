# @octanejs/nuqs

[nuqs](https://nuqs.dev) for the [octane](https://github.com/octanejs/octane) UI
framework — type-safe search-params state as octane hooks.

nuqs cleanly separates a **framework-agnostic core** (the `parseAs*` parsers,
`createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1`, and
the throttle/debounce update queues) from a small **React binding**
(`useQueryState`, `useQueryStates`, and the adapter context). This package
vendors the core verbatim from nuqs 2.9.1 and reimplements only the binding on
octane's hooks — keeping upstream's implementation shape (`useSyncExternalStore`
over `location.search`, render-time URL reconciliation, the shared throttle
queue), so re-render and URL-sync behavior match nuqs on React. The public
surface matches nuqs 1:1 — existing nuqs code works by changing the import.

```tsx
// before
import { useQueryState, parseAsInteger } from 'nuqs';
// after
import { useQueryState, parseAsInteger } from '@octanejs/nuqs';

function Counter() @{
  const [count, setCount] = useQueryState('count', parseAsInteger.withDefault(0));
  <button onClick={() => setCount((c) => (c ?? 0) + 1)}>count is {count as string}</button>
}
```

Wrap your app in an adapter once, at the root:

```tsx
import { NuqsAdapter } from '@octanejs/nuqs/adapters/react';

function App() @{
  <NuqsAdapter>
    <Counter />
  </NuqsAdapter>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octanejs/nuqs` | `useQueryState`, `useQueryStates`, all `parseAs*` parsers, `createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1` | core vendored verbatim + the octane-bound hooks |
| `@octanejs/nuqs/server` | `createLoader`, `createSerializer`, parsers, `createStandardSchemaV1` | react-free, safe to import from server-only modules |
| `@octanejs/nuqs/adapters/react` | `NuqsAdapter`, `enableHistorySync` | the standalone (router-less) adapter, ported to octane |
| `@octanejs/nuqs/adapters/custom` | `unstable_createAdapterProvider`, `renderQueryString` + adapter types | build an adapter for your own router |
| `@octanejs/nuqs/adapters/testing` | `NuqsTestingAdapter`, `withNuqsTestingAdapter` | in-memory adapter for tests |
| `@octanejs/nuqs/testing` | `isParserBijective`, `testParseThenSerialize`, `testSerializeThenParse` | parser test helpers (framework-agnostic) |
| `@octanejs/nuqs/debug` | side-effect import | opt debug logging into the bundle (`localStorage.debug = 'nuqs'`) |

## How it works

octane keys hooks by a compiler-injected per-call-site `Symbol` and transforms
raw-source octane packages automatically, so the ported hooks are written as
ordinary `use*` calls (no manual slot bookkeeping) — `useQueryState('a')` and
`useQueryState('b')` in one component stay independent, exactly like distinct
call sites in React.

`useQueryStates` is a line-for-line port of nuqs's implementation: it reads the
URL through the active adapter's `useSyncExternalStore`, reconciles the parsed
values into `useState` both during render and from an effect backstop, and
writes updates through nuqs's shared throttle/debounce queue. That means the same
observable behavior as nuqs on React, including:

- **Read the default, write the URL.** A missing key resolves to the parser's
  default without polluting the URL; the key is written only once the value
  diverges.
- **`clearOnDefault`.** Setting a value back to its default removes the key from
  the URL (opt out per-call, per-parser, or per-adapter).
- **Cross-hook sync.** Two components bound to the same key update together, and
  external `popstate`/history changes reconcile into state.
- **Throttled updates.** Rapid setter calls coalesce through the shared queue and
  return a `Promise<URLSearchParams>` that resolves once the URL has committed.

## Divergences from nuqs

- **Router adapters for other React routers are not shipped**:
  `nuqs/adapters/next`, `/adapters/remix`, `/adapters/react-router`, and
  `/adapters/tanstack-router` each bind a React router that would need its own
  octane port. Use `/adapters/react`, or `/adapters/custom` to wire your router.
- **`createSearchParamsCache` is not ported.** It is built on React Server
  Components' `React.cache()`, which octane does not implement (no Server
  Components). Use `createLoader` for request-scoped parsing.
- `TransitionStartFunction` is declared locally, so the package carries no
  `@types/react` dependency.

## Status

Alpha, like octane itself. See [`status.json`](./status.json) and the generated
[bindings status table](../../docs/bindings-status.md) for the verified surface,
divergences, and last evidence check.
