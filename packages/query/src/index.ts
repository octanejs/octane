// @octanejs/query — TanStack Query for the octane renderer.
//
// Reuses @tanstack/query-core verbatim (QueryClient, observers, caches — all
// framework-agnostic) and reimplements the React binding on octane's hooks. The
// public surface matches @tanstack/react-query, so most query code works by
// changing the import.
export * from '@tanstack/query-core';

export { useQuery } from './useQuery';
export { useMutation } from './useMutation';
export { useInfiniteQuery } from './useInfiniteQuery';
export { useSuspenseQuery, useSuspenseInfiniteQuery } from './useSuspenseQuery';
export { usePrefetchQuery, usePrefetchInfiniteQuery } from './usePrefetch';
export { useQueries } from './useQueries';
export { useIsFetching } from './useIsFetching';
export { useMutationState, useIsMutating } from './useMutationState';
export { useQueryClient, QueryClientContext } from './context';
export { QueryClientProvider } from './QueryClientProvider.tsrx';
export { HydrationBoundary } from './HydrationBoundary';
export { IsRestoringProvider, IsRestoringContext, useIsRestoring } from './isRestoring';
export { QueryErrorResetBoundary } from './QueryErrorResetBoundary.tsrx';
export { QueryErrorResetBoundaryContext, useQueryErrorResetBoundary } from './errorResetBoundary';
