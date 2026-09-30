# @octanejs/tanstack-query-devtools

[TanStack Query Devtools](https://tanstack.com/query/latest/docs/framework/react/devtools)
for [Octane](https://github.com/octanejs/octane).

This is an Octane port of `@tanstack/react-query-devtools`. It reuses the
framework-agnostic `@tanstack/query-devtools` core **unchanged** and ports the thin
adapter layer: the `ReactQueryDevtools` floating panel and the `ReactQueryDevtoolsPanel`
embedded panel. It works with [`@octanejs/tanstack-query`](../tanstack-query).

## Installation

```bash
npm install @octanejs/tanstack-query-devtools @octanejs/tanstack-query
pnpm add @octanejs/tanstack-query-devtools @octanejs/tanstack-query
```

## Usage

```tsx
import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { ReactQueryDevtools } from '@octanejs/tanstack-query-devtools';

const client = new QueryClient();

function App() @{
  <QueryClientProvider client={client}>
    <Todos />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
}
```

`ReactQueryDevtoolsPanel` embeds the panel inline instead of floating it:

```tsx
import { ReactQueryDevtoolsPanel } from '@octanejs/tanstack-query-devtools';

function Debug() @{
  <ReactQueryDevtoolsPanel style={{ height: '400px' }} onClose={() => {}} />
}
```

Both components take the same props as their React counterparts, and resolve the
`QueryClient` from the nearest `QueryClientProvider` unless a `client` prop is passed.

## Development only by default

As in the React package, the root entry renders nothing unless
`process.env.NODE_ENV === 'development'`. Import from the `production` subpath to keep
the devtools in a production build:

```tsx
import { ReactQueryDevtools } from '@octanejs/tanstack-query-devtools/production';
```

## Differences from `@tanstack/react-query-devtools`

- The devtools core instance is created in a lazy `useState` initializer, so a re-render
  does not construct and discard a new core instance.
- `style` on `ReactQueryDevtoolsPanel` takes Octane's `CSSProperties`, and `onClose` may
  return any value.

See [`UPSTREAM.md`](./UPSTREAM.md) for the pinned upstream release and export crosswalk.
