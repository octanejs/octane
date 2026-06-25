// @octane-ts/query — TanStack Query for the octane renderer.
//
// Reuses @tanstack/query-core verbatim (QueryClient, observers, caches — all
// framework-agnostic) and reimplements the React binding on octane's hooks. The
// public surface matches @tanstack/react-query, so most query code works by
// changing the import.
export * from '@tanstack/query-core';

export { useQuery } from './useQuery';
export { useMutation } from './useMutation';
export { useQueryClient, QueryClientContext } from './context';
export { QueryClientProvider } from './QueryClientProvider.tsrx';
