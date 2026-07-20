# Draft: NPM Watchlist Registry

## Purpose

Define a source-of-truth registry for tracked npm entities, rollups, and curated watchlists.

This registry should replace the idea that `popular comparisons` are the canonical list. Popular comparisons can still exist, but they should derive from this registry.

Rollups should be the reusable grouping abstraction.

Watchlists should remain the primary user-facing saved and subscribed surface. Categories are metadata on entities, not the source of truth for ranking surfaces.

## Design Goals

- Model logical libraries, not just raw package names.
- Support legacy package rollups.
- Support reusable rollup definitions for ecosystems and grouped chart views.
- Keep curation explicit and reviewable in code.
- Make it easy to derive chart `packageGroups` for the existing UI.
- Leave room for future time-aware lineage rules without requiring them in v1.

## Suggested File

- `src/utils/npm-watchlists.ts`

## Proposed Types

```ts
export type NpmTrackedEntity = {
  id: string
  label: string
  shortLabel?: string
  description?: string
  categories: Array<
    | 'tanstack'
    | 'data-fetching'
    | 'routing'
    | 'state'
    | 'table'
    | 'form'
    | 'virtualization'
    | 'testing'
    | 'styling'
    | 'build'
    | 'validation'
    | 'docs'
    | 'framework'
    | 'animation'
    | 'tooling'
    | 'database'
  >
  color?: string
  packages: Array<{
    name: string
    from?: string
    to?: string
  }>
  lineageStrategy?: 'sum-all' | 'time-bounded'
  benchmarkEligible?: boolean
  popularComparisonEligible?: boolean
  hidden?: boolean
}

export type NpmWatchlist = {
  id: string
  title: string
  description?: string
  kind: 'curated-category' | 'curated-benchmark' | 'curated-tanstack'
  entityIds?: string[]
  rollupIds?: string[]
  featured?: boolean
  public?: boolean
  popularComparison?: boolean
  benchmark?: boolean
}

export type NpmRollup = {
  id: string
  title: string
  description?: string
  kind: 'ecosystem' | 'category' | 'benchmark' | 'editorial'
  entityIds: string[]
  membershipMode?: 'exclusive' | 'overlap'
  color?: string
  public?: boolean
}
```

## V1 Simplification

Even though the entity type allows `from` and `to`, v1 can treat almost all tracked entities as:

- `lineageStrategy: 'sum-all'`
- all packages included for the full period

That matches the current stats architecture and keeps the first implementation simple.

## Derivations

The registry should support these outputs:

1. `getWatchlist(id)`
2. `getTrackedEntity(id)`
3. `getRollup(id)`
4. `getFeaturedWatchlists()`
5. `toPackageGroups(watchlist)` for existing chart routes
6. `toPopularComparisons()` to replace hand-maintained duplication
7. `groupEntitiesByRollup(entityIds, rollupIds)` for charting and digest summarization

## Curation Rules

### Tracked entities

- One entity should represent one logical product or library line.
- One entity can belong to multiple categories.
- Legacy package names should be included when they clearly map to the same product lineage.
- Do not merge adjacent but meaningfully different products just because users might compare them.

### Watchlists

- A curated category watchlist should feel category-coherent.
- A benchmark watchlist should be broad, stable, and slow-changing.
- A featured watchlist should be editorially maintained and reviewed regularly.

### Rollups

- A rollup is a reusable editorial grouping of entities.
- Rollups are explicit, not inferred from npm scopes or package naming.
- Some rollups can overlap.
- Some rollups should be exclusive where double counting would distort rankings.
- Rollups should be stable enough to support long-term historical views.

### Review cadence

- Featured watchlists: monthly review
- Benchmark watchlists: quarterly review
- Ecosystem rollups: quarterly review
- Entity lineage changes: only when we have high confidence

## Starter Tracked Entities

This is not exhaustive. It is the first pass for v1.

```ts
export const trackedEntities: NpmTrackedEntity[] = [
  {
    id: 'tanstack-query',
    label: 'TanStack Query',
    categories: ['tanstack', 'data-fetching'],
    color: '#FF4500',
    packages: [{ name: '@tanstack/react-query' }, { name: 'react-query' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'swr',
    label: 'SWR',
    categories: ['data-fetching'],
    color: '#ec4899',
    packages: [{ name: 'swr' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'apollo-client',
    label: 'Apollo Client',
    categories: ['data-fetching'],
    color: '#6B46C1',
    packages: [{ name: '@apollo/client' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'trpc-client',
    label: 'tRPC Client',
    categories: ['data-fetching'],
    color: '#2596BE',
    packages: [{ name: '@trpc/client' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'tanstack-router',
    label: 'TanStack Router',
    categories: ['tanstack', 'routing'],
    color: '#32CD32',
    packages: [{ name: '@tanstack/react-router' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'react-router',
    label: 'React Router',
    categories: ['routing'],
    color: '#FF0000',
    packages: [{ name: 'react-router' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'wouter',
    label: 'Wouter',
    categories: ['routing'],
    color: '#8b5cf6',
    packages: [{ name: 'wouter' }],
    popularComparisonEligible: true,
  },
  {
    id: 'tanstack-table',
    label: 'TanStack Table',
    categories: ['tanstack', 'table'],
    color: '#FF7043',
    packages: [{ name: '@tanstack/react-table' }, { name: 'react-table' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'ag-grid',
    label: 'AG Grid',
    categories: ['table'],
    color: '#29B6F6',
    packages: [{ name: 'ag-grid-community' }, { name: 'ag-grid-enterprise' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'mui-data-grid',
    label: 'MUI Data Grid',
    categories: ['table'],
    color: '#1976D2',
    packages: [{ name: '@mui/x-data-grid' }, { name: 'mui-datatables' }],
    popularComparisonEligible: true,
  },
  {
    id: 'tanstack-form',
    label: 'TanStack Form',
    categories: ['tanstack', 'form'],
    color: '#FFD700',
    packages: [
      { name: '@tanstack/form-core' },
      { name: '@tanstack/react-form' },
    ],
    popularComparisonEligible: true,
  },
  {
    id: 'react-hook-form',
    label: 'React Hook Form',
    categories: ['form'],
    color: '#EC5990',
    packages: [{ name: 'react-hook-form' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'conform',
    label: 'Conform',
    categories: ['form'],
    color: '#FF5733',
    packages: [{ name: '@conform-to/dom' }],
    popularComparisonEligible: true,
  },
  {
    id: 'tanstack-virtual',
    label: 'TanStack Virtual',
    categories: ['tanstack', 'virtualization'],
    color: '#8B5CF6',
    packages: [{ name: '@tanstack/react-virtual' }, { name: 'react-virtual' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'react-window',
    label: 'react-window',
    categories: ['virtualization'],
    color: '#4ECDC4',
    packages: [{ name: 'react-window' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'react-virtualized',
    label: 'react-virtualized',
    categories: ['virtualization'],
    color: '#FF6B6B',
    packages: [{ name: 'react-virtualized' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'redux',
    label: 'Redux',
    categories: ['state'],
    color: '#764ABC',
    packages: [{ name: 'redux' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'zustand',
    label: 'Zustand',
    categories: ['state'],
    color: '#764ABC',
    packages: [{ name: 'zustand' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'jotai',
    label: 'Jotai',
    categories: ['state'],
    color: '#6366f1',
    packages: [{ name: 'jotai' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'valtio',
    label: 'Valtio',
    categories: ['state'],
    color: '#FF6B6B',
    packages: [{ name: 'valtio' }],
    popularComparisonEligible: true,
  },
  {
    id: 'vite',
    label: 'Vite',
    categories: ['build', 'tooling'],
    color: '#008000',
    packages: [{ name: 'vite' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'webpack',
    label: 'Webpack',
    categories: ['build', 'tooling'],
    color: '#8DD6F9',
    packages: [{ name: 'webpack' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'rollup',
    label: 'Rollup',
    categories: ['build', 'tooling'],
    color: '#e80A3F',
    packages: [{ name: 'rollup' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'esbuild',
    label: 'esbuild',
    categories: ['build', 'tooling'],
    color: '#FFCF00',
    packages: [{ name: 'esbuild' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'rspack',
    label: 'Rspack',
    categories: ['build', 'tooling'],
    color: '#8DD6F9',
    packages: [{ name: '@rspack/core' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'zod',
    label: 'Zod',
    categories: ['validation'],
    color: '#ef4444',
    packages: [{ name: 'zod' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'valibot',
    label: 'Valibot',
    categories: ['validation'],
    color: '#f97316',
    packages: [{ name: 'valibot' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'yup',
    label: 'Yup',
    categories: ['validation'],
    color: '#06b6d4',
    packages: [{ name: 'yup' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'react',
    label: 'React',
    categories: ['framework'],
    color: '#61DAFB',
    packages: [{ name: 'react' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'vue',
    label: 'Vue',
    categories: ['framework'],
    color: '#41B883',
    packages: [{ name: 'vue' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'angular-core',
    label: 'Angular',
    categories: ['framework'],
    color: '#DD0031',
    packages: [{ name: '@angular/core' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'svelte',
    label: 'Svelte',
    categories: ['framework'],
    color: '#FF3E00',
    packages: [{ name: 'svelte' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
  {
    id: 'solid-js',
    label: 'Solid',
    categories: ['framework'],
    color: '#2C4F7C',
    packages: [{ name: 'solid-js' }],
    benchmarkEligible: true,
    popularComparisonEligible: true,
  },
]
```

## Starter Curated Watchlists

```ts
export const watchlists: NpmWatchlist[] = [
  {
    id: 'data-fetching',
    title: 'Data Fetching',
    kind: 'curated-category',
    entityIds: ['tanstack-query', 'swr', 'apollo-client', 'trpc-client'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'routing-react',
    title: 'Routing (React)',
    kind: 'curated-category',
    entityIds: ['react-router', 'tanstack-router', 'wouter'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'tables-data-grids',
    title: 'Tables and Data Grids',
    kind: 'curated-category',
    entityIds: ['ag-grid', 'tanstack-table', 'mui-data-grid'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'forms',
    title: 'Forms',
    kind: 'curated-category',
    entityIds: ['react-hook-form', 'tanstack-form', 'conform'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'virtualization',
    title: 'Virtualization',
    kind: 'curated-category',
    entityIds: ['react-virtualized', 'react-window', 'tanstack-virtual'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'state-management',
    title: 'State Management',
    kind: 'curated-category',
    entityIds: ['redux', 'zustand', 'jotai', 'valtio'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'build-tools',
    title: 'Build Tools',
    kind: 'curated-category',
    entityIds: ['webpack', 'vite', 'rollup', 'esbuild', 'rspack'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'validation',
    title: 'Validation',
    kind: 'curated-category',
    entityIds: ['zod', 'valibot', 'yup'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'frameworks',
    title: 'Frameworks',
    kind: 'curated-category',
    entityIds: ['react', 'vue', 'angular-core', 'svelte', 'solid-js'],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'all-tanstack',
    title: 'All TanStack Libraries',
    kind: 'curated-tanstack',
    entityIds: [
      'tanstack-query',
      'tanstack-router',
      'tanstack-table',
      'tanstack-form',
      'tanstack-virtual',
    ],
    featured: true,
    public: true,
    popularComparison: true,
  },
  {
    id: 'javascript-ecosystem-leaders',
    title: 'JavaScript Ecosystem Leaders',
    kind: 'curated-benchmark',
    entityIds: [
      'react',
      'vue',
      'angular-core',
      'svelte',
      'vite',
      'webpack',
      'rollup',
      'esbuild',
      'react-router',
      'tanstack-query',
      'apollo-client',
      'redux',
      'zustand',
      'react-hook-form',
      'zod',
    ],
    featured: true,
    public: true,
    benchmark: true,
  },
]
```

## Starter Rollups

These are the new reusable grouping layer.

```ts
export const rollups: NpmRollup[] = [
  {
    id: 'tanstack-ecosystem',
    title: 'TanStack Ecosystem',
    kind: 'ecosystem',
    entityIds: [
      'tanstack-query',
      'tanstack-router',
      'tanstack-table',
      'tanstack-form',
      'tanstack-virtual',
    ],
    membershipMode: 'exclusive',
    color: '#FF4500',
    public: true,
  },
  {
    id: 'data-fetching-ecosystem',
    title: 'Data Fetching Ecosystem',
    kind: 'category',
    entityIds: ['tanstack-query', 'swr', 'apollo-client', 'trpc-client'],
    membershipMode: 'overlap',
    public: true,
  },
  {
    id: 'router-ecosystem',
    title: 'Router Ecosystem',
    kind: 'category',
    entityIds: ['react-router', 'tanstack-router', 'wouter'],
    membershipMode: 'overlap',
    public: true,
  },
  {
    id: 'javascript-ecosystem-index',
    title: 'JavaScript Ecosystem Index',
    kind: 'benchmark',
    entityIds: [
      'react',
      'vue',
      'angular-core',
      'svelte',
      'vite',
      'webpack',
      'rollup',
      'esbuild',
      'react-router',
      'tanstack-query',
      'redux',
      'react-hook-form',
      'zod',
    ],
    membershipMode: 'overlap',
    public: true,
  },
]
```

Future ecosystem rollups can include:

- `vercel-ecosystem`
- `remix-ecosystem`
- `shopify-ecosystem`

Those should be explicit editorial definitions, not guessed from npm scopes.

## Notes On Specific TanStack Entities

### Query

- Roll up `react-query` into `@tanstack/react-query`.
- This is a clear lineage case.

### Table

- Roll up `react-table` into `@tanstack/react-table`.
- This is also a clear lineage case.

### Virtual

- Roll up `react-virtual` into `@tanstack/react-virtual`.
- Clear lineage case.

### Router

- Do not automatically roll `react-location` into `@tanstack/react-router` in v1.
- They are adjacent and related, but this one is more semantically debatable than Query, Table, or Virtual.
- Keep this as an explicit later decision if we want lineage continuity there.

### Form

- It may be useful to define separate tracked entities for `@tanstack/form-core` and `@tanstack/react-form` later.
- For now, a single `TanStack Form` entity is probably fine if the goal is product-level visibility.

## Migration From Existing Popular Comparisons

Recommended path:

1. Create the entity, rollup, and watchlist registry.
2. Rebuild `getPopularComparisons()` from curated watchlists and rollups marked for that purpose.
3. Keep route behavior and `packageGroup` format unchanged at first.
4. Add optional rollup grouping to chart UI later.
5. Remove duplication once parity looks good.

## Open Decisions

1. How aggressive should we be about rolling up framework adapters into one product-level TanStack entity?
2. Which rollups should be exclusive versus overlap-friendly?
3. Should benchmark lists include only `benchmarkEligible` entities or also allow manual exceptions?
4. Should `JavaScript Ecosystem Leaders` aim for 25, 50, or 100 entities in v1?
5. Which watchlists and rollups should be exposed publicly on day one versus internal-only at first?

## Immediate Next Steps

- Convert this draft into a real `src/utils/npm-watchlists.ts` module.
- Add real rollup definitions for ecosystem and benchmark views.
- Fill out the tracked entity registry beyond the starter set.
- Rebuild stale popular comparisons from the registry.
- Draft the first larger benchmark roster separately.
