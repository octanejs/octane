/**
 * SWR-backed adapter for `@solana/react`. Bridges Kit's reactive primitives into SWR's
 * cache so multiple components reading the same key share a single in-flight request,
 * participate in SWR's revalidation triggers (focus, reconnect, polling), and show up in
 * SWR's devtools.
 *
 * Import from `@solana/react/swr` — the subpath requires `swr` as a peer dep but is otherwise
 * isolated from the core export so consumers who don't use SWR aren't forced to install it.
 *
 * @packageDocumentation
 */
export * from './swr/useRequestSWR';
export * from './swr/useSubscriptionSWR';
export * from './swr/useTrackedDataSWR';
