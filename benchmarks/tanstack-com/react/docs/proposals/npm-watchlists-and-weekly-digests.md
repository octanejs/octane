# Proposal: NPM Watchlists and Weekly Digests

## North Star

Turn TanStack NPM Stats into a durable market map for JavaScript libraries, not just a charting tool.

Users should be able to follow a set of libraries, understand who is actually gaining or losing ground inside that set, and get a concise weekly digest that surfaces meaningful movement without reacting to noisy daily swings.

## Why This Matters

- Raw npm download charts are useful, but they do not answer "who is winning?"
- Raw download growth is increasingly misleading because the whole ecosystem keeps growing.
- Users care about cohorts, rankings, trend changes, and share shifts more than isolated download counts.
- TanStack already has fast comparison UX and historical npm data. This feature turns that into a repeatable product.

## Product Outcome

Add rollups and watchlists that users can explore, compare, and subscribe to by email once a week.

Each digest should answer:

- Which libraries moved up or down?
- Which libraries gained or lost share?
- Which crossovers happened?
- Which trends look sustained instead of noisy?

## Core Product Principles

- `packages -> entities -> rollups -> watchlists` should be the core model.
- Watchlists are the user-facing saved and subscribed surface.
- Rollups are reusable editorial groupings for charts, rankings, and ecosystem views.
- Popular comparisons are just one derived view, not the source of truth.
- Rankings should be cohort-aware, not framed as vague "global npm rank".
- Normalization should favor share and relative outperformance, not raw download growth.
- Long-term rollups must work across legacy package names and package renames.
- Weekly summaries should highlight meaningful movement, not short-term volatility.

## User Stories

1. As a user, I can subscribe to a curated watchlist like `Data Fetching` or `Build Tools`.
2. As a user, I can save a custom watchlist from the current `/stats/npm` comparison.
3. As a user, I can follow a logical library even if its npm history spans multiple package names.
4. As a user, I can receive a weekly digest showing rank changes, share changes, and notable crossovers.
5. As a user, I can look back across months or years and see how the watchlist evolved.
6. As a user, I can compare larger ecosystem rollups like `TanStack` vs `Vercel` vs `Remix`.
7. As a user, I can plot entities grouped by rollup on charts.

## Product Shape

### 1. Tracked entities

The atomic unit should not be a single npm package. It should be a logical tracked entity.

Example:

```ts
{
  id: 'tanstack-query',
  label: 'TanStack Query',
  packages: ['@tanstack/react-query', 'react-query'],
}
```

This gives us:

- continuity across legacy/current package names
- stable ranking entities
- cleaner digest language
- long-term rollups without losing historical identity

### 2. Rollups

A rollup is a reusable grouped view of tracked entities.

Examples:

- `tanstack-ecosystem`
- `vercel-ecosystem`
- `remix-ecosystem`
- `data-fetching-ecosystem`
- `router-ecosystem`

Rollups let us:

- compare larger ecosystems on charts
- group entities visually inside one watchlist
- create reusable market-map views without copying entity membership everywhere
- support ecosystem-vs-ecosystem reporting in digests later

### 3. Watchlists

A watchlist is a named saved surface for ranking, digesting, and charting.

A watchlist can contain:

- entities directly
- rollups
- or both, depending on the UX we want

Recommended watchlist types:

- Curated category watchlists
- Curated benchmark watchlists
- TanStack-specific watchlists
- Ecosystem watchlists
- User-created custom watchlists

### 4. Weekly digest

Each watchlist can produce a weekly digest with:

- current rank
- previous rank
- rank delta
- share of watchlist
- share delta
- trailing 4-week trend
- notable crossovers
- link back to the live chart

Future digest expansions:

- rollup-vs-rollup share changes
- entity movement inside a rollup
- ecosystem momentum summaries

## Current Model Draft

This is the current preferred abstraction stack:

- `package`: raw npm package history
- `entity`: one logical library or product across one or more packages
- `rollup`: reusable editorial grouping of entities
- `watchlist`: a saved and subscribable surface for charts, rankings, and digests

Current preferred type direction:

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
```

Important modeling notes:

- categories belong on entities as `categories: string[]`, not a single `category`
- watchlists are still the primary curated product surface
- rollups are the reusable grouping abstraction
- popular comparisons should be derived from the registry, not hand-maintained independently
- v1 can mostly use `lineageStrategy: 'sum-all'`
- the model should still leave room for future time-bounded lineage

## Current Decisions

These are the main decisions made so far and should be preserved in any handoff.

- Do not frame the feature as "global npm rank" in v1.
- Rank within a defined cohort, watchlist, or benchmark basket.
- Use trailing 28-day downloads for ranking.
- Use share of watchlist as the primary normalization lens.
- Use relative growth vs watchlist median as a secondary lens.
- Defer anomaly detection.
- Prefer conservative digest-oriented trend signals over loose anomaly alerts.
- Build curated entities and watchlists separately from current `popular comparisons`.
- Include legacy package rollups where lineage is clear.
- Preserve compatibility with long-term and multi-year rollups.
- Treat rollups as first-class because ecosystem-vs-ecosystem views are valuable.
- Allow entities to belong to multiple categories.
- Allow some rollups to overlap and some to be exclusive.

## Lineage Decisions So Far

These are the explicit lineage calls already discussed.

- Roll up `react-query` into `@tanstack/react-query`.
- Roll up `react-table` into `@tanstack/react-table`.
- Roll up `react-virtual` into `@tanstack/react-virtual`.
- Do not automatically roll `react-location` into `@tanstack/react-router` in v1.
- TanStack Form may eventually need separate entity treatment for `@tanstack/form-core` and `@tanstack/react-form`, but one product-level entity is acceptable for v1.

## Starter Registry Direction

These are the concrete examples already drafted and should be treated as the current starting point, not final production data.

Starter entities:

- `tanstack-query`: `@tanstack/react-query` + `react-query`
- `swr`: `swr`
- `apollo-client`: `@apollo/client`
- `trpc-client`: `@trpc/client`
- `tanstack-router`: `@tanstack/react-router`
- `react-router`: `react-router`
- `wouter`: `wouter`
- `tanstack-table`: `@tanstack/react-table` + `react-table`
- `ag-grid`: `ag-grid-community` + `ag-grid-enterprise`
- `mui-data-grid`: `@mui/x-data-grid` + `mui-datatables`
- `tanstack-form`: `@tanstack/form-core` + `@tanstack/react-form`
- `react-hook-form`: `react-hook-form`
- `conform`: `@conform-to/dom`
- `tanstack-virtual`: `@tanstack/react-virtual` + `react-virtual`
- `react-window`: `react-window`
- `react-virtualized`: `react-virtualized`
- `redux`: `redux`
- `zustand`: `zustand`
- `jotai`: `jotai`
- `valtio`: `valtio`
- `vite`: `vite`
- `webpack`: `webpack`
- `rollup`: `rollup`
- `esbuild`: `esbuild`
- `rspack`: `@rspack/core`
- `zod`: `zod`
- `valibot`: `valibot`
- `yup`: `yup`
- `react`: `react`
- `vue`: `vue`
- `angular-core`: `@angular/core`
- `svelte`: `svelte`
- `solid-js`: `solid-js`

Starter watchlists:

- `data-fetching`
- `routing-react`
- `tables-data-grids`
- `forms`
- `virtualization`
- `state-management`
- `build-tools`
- `validation`
- `frameworks`
- `all-tanstack`
- `javascript-ecosystem-leaders`

Starter rollups:

- `tanstack-ecosystem`
- `data-fetching-ecosystem`
- `router-ecosystem`
- `javascript-ecosystem-index`

Future rollups already discussed:

- `vercel-ecosystem`
- `remix-ecosystem`
- `shopify-ecosystem`

## Rollup Semantics

Rollups should be explicit editorial definitions, not inferred automatically from npm scopes or package naming.

Two intended rollup modes:

- `exclusive`: best for aggregate comparisons where double counting would distort the view
- `overlap`: best for discovery, category views, and flexible grouped charting

Examples:

- `tanstack-ecosystem` should likely be `exclusive`
- category-style rollups like `router-ecosystem` can be `overlap`

## Popular Comparisons Migration

The current `popular comparisons` file is useful but not a good source of truth.

Migration direction:

1. Build the entity, rollup, and watchlist registry.
2. Rebuild `getPopularComparisons()` from curated watchlists and rollups flagged for chart use.
3. Keep the existing route behavior and `packageGroup` output shape unchanged at first.
4. Add rollup-aware chart grouping later.
5. Remove duplicated manual comparison definitions once parity looks good.

## Handoff Notes

If another agent picks this up, these are the highest-value next steps already implied by the current plan.

1. Convert the draft model into a real `src/utils/npm-watchlists.ts` module.
2. Expand the entity registry beyond the starter examples.
3. Define the first real ecosystem rollups.
4. Decide the first public benchmark basket, especially `JavaScript Ecosystem Leaders`.
5. Replace stale `popular comparisons` with registry-derived definitions.
6. Design the DB schema around entities, rollups, watchlists, subscriptions, and weekly snapshots.

## Registry Strategy

### Entities, rollups, and watchlists should become a first-class registry

Current `popular comparisons` are useful, but they are not sufficient as the long-term source of truth.

Problems with using them directly:

- some are out of date
- some are sized for chart exploration, not ongoing tracking
- some do not include legacy package rollups
- some are too small or too editorial for ranking semantics

We should create a separate curated registry for entities, rollups, and watchlists and let `popular comparisons` derive from it where useful.

Suggested source file:

- `src/utils/npm-watchlists.ts`

### Why rollups matter

Rollups are what let this feature graduate from simple package comparison into a real market map.

Examples:

- compare `TanStack` vs `Vercel` vs `Remix`
- plot all router-related entities and color them by ecosystem rollup
- compare a product rollup against its category peers
- track how an ecosystem's aggregate share changes over time

### Starter watchlist categories

Curated category watchlists:

- Data Fetching
- Routing
- Tables and Data Grids
- Forms
- State Management
- Virtualization
- Testing
- Styling
- Build Tools
- Validation and Schema
- Motion and Animation
- Meta-frameworks

Curated benchmark watchlists:

- JavaScript Ecosystem Leaders
- React Ecosystem Leaders
- JavaScript Infra Index
- Frontend Foundation 50

TanStack watchlists:

- All TanStack Libraries
- TanStack Query Ecosystem
- TanStack Router Ecosystem
- TanStack Table Ecosystem

Ecosystem rollups and watchlists:

- TanStack Ecosystem
- Vercel Ecosystem
- Remix Ecosystem
- Router Ecosystem
- Data Fetching Ecosystem

## Legacy Package Rules

Legacy packages should usually roll into the same tracked entity when they represent the same product lineage.

Examples:

- `react-query` + `@tanstack/react-query`
- `react-table` + `@tanstack/react-table`
- `react-virtual` + `@tanstack/react-virtual`

Do not assume every rename or adjacent product belongs in the same lineage forever. The model should allow future time-aware lineage rules if simple summing becomes misleading.

V1 rule:

- tracked entities use a flat array of package names and simple summed downloads

Future rule if needed:

- tracked entities can support time-bounded package membership

## Ranking and Normalization

Raw download growth is not a good primary signal because the entire ecosystem is growing.

### Primary ranking metric

Use trailing 28-day downloads for rank within a watchlist.

Why 28-day:

- smoother than daily or weekly
- still responsive enough for weekly digests
- less sensitive to npm reporting noise

### Primary normalization metric: share of watchlist

```txt
share_of_watchlist = entity_28d_downloads / sum(all_watchlist_entity_28d_downloads)
```

This should be the main lens in digests because it makes leaders and laggards visible even when the whole cohort is growing.

### Secondary normalization metric: relative growth vs cohort

```txt
relative_growth = entity_growth_rate - median_growth_rate_of_watchlist
```

This helps answer whether a library is outperforming or underperforming peers.

### Optional tertiary benchmark: ecosystem index

Do not use a raw sum of giant packages as the main baseline.

If we add an ecosystem benchmark, it should come from a stable curated basket like `JavaScript Ecosystem Leaders` and use a median or trimmed-mean growth factor rather than raw weighted sum.

### Digest metrics to show in v1

- rank
- rank delta
- share of watchlist
- share delta
- trailing 4-week trend
- crossover events

## Trend Detection

Avoid generic "anomaly detection" in v1.

The data is too noisy and npm has known reporting weirdness. We already correct obvious outliers and zero-day anomalies in the stats pipeline.

If we surface trend change signals, they should be conservative and digest-oriented.

Suggested v1 notable movement rules:

- rank changed by at least 1
- share moved by a meaningful threshold
- one entity crossed another and stayed ahead for at least one full digest period
- growth outperformed the cohort median by a meaningful margin

Possible later signals:

- sustained acceleration over 4 weeks vs prior 8 to 12 weeks
- sustained deceleration over 4 weeks vs prior 8 to 12 weeks
- held rank breakout after 2 consecutive weeks

## Long-Term Rollups

This feature must support multi-year rollups.

The current architecture is already favorable:

- npm history is cached as year-based daily chunks
- historical chunks are immutable
- package groups already support rollups across multiple packages

What we need to preserve:

- tracked entities, not single-package rows
- reusable rollups on top of tracked entities
- raw historical chunks as source of truth
- derived weekly or monthly snapshots for cheap leaderboard queries

Recommended derived data:

- weekly watchlist snapshots for digest generation and rank history
- optional monthly snapshots for faster long-range reporting

This keeps the system flexible:

- raw chunks allow recomputation when formulas change
- snapshots keep digests and rank-history queries cheap
- rollups can be recalculated without changing the raw source data

### Rollup views to support later

- yearly rollup trend lines
- rank history by entity within a rollup
- ecosystem-vs-ecosystem comparisons
- grouped charts where entities are colored or faceted by rollup

## UX Entry Points

### `/stats/npm`

- `Save this comparison`
- `Follow this watchlist`
- `Subscribe to weekly digest`

### Library-specific npm stats pages

- `Follow this library`
- `Add to watchlist`

### Account area

- My watchlists
- Subscriptions
- Digest frequency
- Pause or unsubscribe

## Data Model Direction

Suggested tables:

- `npm_tracked_entities`
- `npm_tracked_entity_packages`
- `npm_rollups`
- `npm_rollup_entities`
- `npm_watchlists`
- `npm_watchlist_items`
- `npm_watchlist_subscriptions`
- `npm_watchlist_weekly_snapshots`
- `npm_digest_sends`

Notes:

- tracked entities are the canonical source for rollups and labels
- rollups reference tracked entities
- watchlists can reference tracked entities, rollups, or both
- weekly snapshots are required for stable digest generation and historical ranking views
- digest send records help with idempotency and auditability

## Implementation Phases

### Phase 1. Curated registry

- Define tracked entities, rollups, and curated watchlists in code
- Include legacy package rollups where appropriate
- Refresh and replace stale `popular comparisons`
- Establish one larger benchmark watchlist like `JavaScript Ecosystem Leaders`

### Phase 2. Snapshot pipeline

- Compute weekly watchlist snapshots from historical npm data
- Store rank, share, and trailing trend fields
- Make snapshot generation idempotent

### Phase 3. User-facing watchlists

- Allow signed-in users to save comparisons as custom watchlists
- Allow subscription management from account surfaces
- Allow subscription from stats pages

### Phase 4. Weekly digests

- Generate digest content from weekly snapshots
- Send through Resend
- Include unsubscribe and pause controls

### Phase 5. Trend signals and benchmark refinement

- Add conservative trend-change detection
- Add ecosystem index if the curated benchmark proves stable and useful

## Suggested Implementation Order

1. Build the curated tracked-entity and watchlist registry.
2. Add reusable rollups for ecosystems and category-level groupings.
3. Replace or derive `popular comparisons` from the new registry.
4. Add database tables for tracked entities, rollups, watchlists, subscriptions, and weekly snapshots.
5. Build the weekly snapshot job on top of existing historical npm chunks.
6. Expose watchlists and rollup grouping in UI without email first.
7. Add weekly digest generation and delivery.
8. Add rank history and long-range watchlist views.
9. Add conservative trend signals only after real snapshot data exists.

## Success Criteria

- Users can subscribe to curated watchlists and custom watchlists.
- Users can compare major ecosystem rollups clearly.
- Digests clearly show rank movement and share movement.
- Rankings are stable enough to feel trustworthy week to week.
- Legacy package history rolls up cleanly into one logical entity.
- Multi-year watchlist history remains queryable and understandable.
- We can explain the ranking math in plain English.

## Non-Goals For V1

- claiming true global npm rank across the whole registry
- real-time alerts
- daily digest spam
- loose anomaly detection with low confidence
- overfitting the system to every one-off package rename

## Open Questions

1. Which curated watchlists should ship first?
2. How large should `JavaScript Ecosystem Leaders` be?
3. Which legacy package transitions deserve permanent lineage rollups?
4. Which rollups should be exclusive versus allowed to overlap?
5. Should custom watchlists allow raw package groups, tracked entities, rollups, or all three?
6. Should digests be weekly only in v1, or should monthly be supported from day one?
7. Do we want one digest per watchlist or one combined digest across all subscriptions?

## Progress

- [ ] Define tracked entity model
- [ ] Define rollup model
- [ ] Draft curated watchlist registry
- [ ] Draft curated ecosystem rollups
- [ ] Audit and refresh current popular comparisons
- [ ] Define lineage rules for legacy package rollups
- [ ] Design DB schema
- [ ] Build weekly snapshot job
- [ ] Build watchlist UI surfaces
- [ ] Build subscription management
- [ ] Build weekly digest generation
- [ ] Build email delivery and unsubscribe flow
- [ ] Add rank history views
- [ ] Evaluate trend signals after snapshot data accumulates

## Notes

- Existing npm stats infrastructure already gives us a strong foundation: historical daily chunks, package grouping, outlier correction, and email transport.
- The biggest risk is product semantics, not raw implementation difficulty.
- The feature will feel credible only if watchlists are curated well and ranking math stays easy to explain.
