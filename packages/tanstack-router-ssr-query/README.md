# @octanejs/tanstack-router-ssr-query

Octane port of `@tanstack/react-router-ssr-query` — wires TanStack Query
dehydration/hydration into TanStack Router SSR streaming and wraps the app
in a `QueryClientProvider`. Delegates to the framework-agnostic
`@tanstack/router-ssr-query-core`.

## Installation

```sh
npm install @octanejs/tanstack-router-ssr-query @octanejs/tanstack-query @octanejs/tanstack-router @tanstack/query-core
pnpm add @octanejs/tanstack-router-ssr-query @octanejs/tanstack-query @octanejs/tanstack-router @tanstack/query-core
```

As in `@tanstack/react-router-ssr-query`, `@tanstack/query-core` is a peer
dependency, so `@tanstack/router-ssr-query-core` uses your application's
TanStack Query core.
