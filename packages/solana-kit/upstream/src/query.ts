/**
 * TanStack Query-backed adapter for `@solana/react`. Bridges Kit's reactive primitives into
 * TanStack Query's cache so multiple components reading the same key share a single in-flight
 * request, participate in TanStack's revalidation triggers (focus, reconnect, polling), become
 * Suspense-capable, and show up in TanStack Query's devtools.
 *
 * Import from `@solana/react/query` — the subpath requires `@tanstack/react-query` as a peer dep
 * but is otherwise isolated from the core export so consumers who don't use TanStack Query aren't
 * forced to install it.
 *
 * @packageDocumentation
 */
export * from './query/useRequestQuery';
export * from './query/useSubscriptionQuery';
export * from './query/useTrackedDataQuery';
