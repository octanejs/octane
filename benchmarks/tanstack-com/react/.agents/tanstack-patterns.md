# TanStack Patterns

## loaderDeps Must Be Specific

Only include properties actually used in the loader. This ensures proper cache invalidation.

```typescript
// Bad: includes everything
loaderDeps: ({ search }) => search,
loader: async ({ deps }) => {
  await fetchData({ page: deps.page, pageSize: deps.pageSize })
}

// Good: only what's used
loaderDeps: ({ search }) => ({
  page: search.page,
  pageSize: search.pageSize,
}),
loader: async ({ deps }) => {
  await fetchData({ page: deps.page, pageSize: deps.pageSize })
}
```

## Loaders Are Isomorphic

Loaders run on both server and client. They cannot directly access server-only APIs.

```typescript
// Bad: direct server API access
loader: async () => {
  const data = await fs.readFile('data.json')
  return { data }
}

// Good: call a server function
loader: async () => {
  const data = await serverFn({ data: { id: '123' } })
  return { data }
}
```

## Environment Shaking

TanStack Start strips any code not referenced by a `createServerFn` handler from the client build.

- Server-only code (database, fs) is automatically excluded from client bundles
- Only code inside `createServerFn` handlers goes to server bundles
- Code outside handlers is included in both bundles

## Importing Server Functions

Server functions wrapped in `createServerFn` can be imported statically. Never use dynamic imports for server-only code in components.

```typescript
// Bad: dynamic import causes bundler issues
const rolesQuery = useQuery({
  queryFn: async () => {
    const { listRoles } = await import('~/utils/roles.server')
    return listRoles({ data: {} })
  },
})

// Good: static import
import { listRoles } from '~/utils/roles.server'

const rolesQuery = useQuery({
  queryFn: async () => listRoles({ data: {} }),
})
```

## Server-Only Import Rules

1. `createServerFn` wrappers can be imported statically anywhere
2. Direct server-only code (database clients, fs) must only be imported:
   - Inside `createServerFn` handlers
   - In `*.server.ts` files
