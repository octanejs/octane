// Assert/Equal checks use immutable upstream declarations and the native renderer types.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
import type { ExpectedContracts } from './expected-contracts';
import { expectTypeOf } from 'vitest';
import * as Actual from '@octanejs/tanstack-query';
import type * as Expected from '@tanstack/react-query';
type AnyUseBaseQueryOptions_1 = Assert<
	Equal<Actual.AnyUseBaseQueryOptions, ExpectedContracts['AnyUseBaseQueryOptions_1']>
>;
type AnyUseInfiniteQueryOptions_1 = Assert<
	Equal<Actual.AnyUseInfiniteQueryOptions, ExpectedContracts['AnyUseInfiniteQueryOptions_1']>
>;
type AnyUseMutationOptions_1 = Assert<
	Equal<Actual.AnyUseMutationOptions, ExpectedContracts['AnyUseMutationOptions_1']>
>;
type AnyUseQueryOptions_1 = Assert<
	Equal<Actual.AnyUseQueryOptions, ExpectedContracts['AnyUseQueryOptions_1']>
>;
type AnyUseSuspenseInfiniteQueryOptions_1 = Assert<
	Equal<
		Actual.AnyUseSuspenseInfiniteQueryOptions,
		ExpectedContracts['AnyUseSuspenseInfiniteQueryOptions_1']
	>
>;
type AnyUseSuspenseQueryOptions_1 = Assert<
	Equal<Actual.AnyUseSuspenseQueryOptions, ExpectedContracts['AnyUseSuspenseQueryOptions_1']>
>;
type DefinedInitialDataInfiniteOptions_1 = Assert<
	Equal<
		Actual.DefinedInitialDataInfiniteOptions<string>,
		ExpectedContracts['DefinedInitialDataInfiniteOptions_1']
	>
>;
type DefinedInitialDataOptions_1 = Assert<
	Equal<Actual.DefinedInitialDataOptions, ExpectedContracts['DefinedInitialDataOptions_1']>
>;
type DefinedUseInfiniteQueryResult_1 = Assert<
	Equal<Actual.DefinedUseInfiniteQueryResult, ExpectedContracts['DefinedUseInfiniteQueryResult_1']>
>;
type DefinedUseQueryResult_1 = Assert<
	Equal<Actual.DefinedUseQueryResult, ExpectedContracts['DefinedUseQueryResult_1']>
>;
type HydrationBoundary_1 = Assert<
	Equal<ReturnType<typeof Actual.HydrationBoundary>, ExpectedContracts['HydrationBoundary_1']>
>;
type HydrationBoundary_2 = Assert<
	Equal<
		Omit<Parameters<typeof Actual.HydrationBoundary>[0], 'children'>,
		ExpectedContracts['HydrationBoundary_2']
	>
>;
type HydrationBoundaryProps_1 = Assert<
	Equal<
		Omit<Actual.HydrationBoundaryProps, 'children'>,
		ExpectedContracts['HydrationBoundaryProps_1']
	>
>;
type IsRestoringProvider_1 = Assert<
	Equal<typeof Actual.IsRestoringProvider, ExpectedContracts['IsRestoringProvider_1']>
>;
type QueriesOptions_1 = Assert<
	Equal<Actual.QueriesOptions<never>, ExpectedContracts['QueriesOptions_1']>
>;
type QueriesResults_1 = Assert<
	Equal<Actual.QueriesResults<never>, ExpectedContracts['QueriesResults_1']>
>;
type QueryClientContext_1 = Assert<
	Equal<typeof Actual.QueryClientContext, ExpectedContracts['QueryClientContext_1']>
>;
type QueryClientProvider_1 = Assert<
	Equal<ReturnType<typeof Actual.QueryClientProvider>, ExpectedContracts['QueryClientProvider_1']>
>;
type QueryClientProvider_2 = Assert<
	Equal<
		Omit<Parameters<typeof Actual.QueryClientProvider>[0], 'children'>,
		ExpectedContracts['QueryClientProvider_2']
	>
>;
type QueryClientProviderProps_1 = Assert<
	Equal<
		Omit<Actual.QueryClientProviderProps, 'children'>,
		ExpectedContracts['QueryClientProviderProps_1']
	>
>;
type QueryErrorClearResetFunction_1 = Assert<
	Equal<Actual.QueryErrorClearResetFunction, ExpectedContracts['QueryErrorClearResetFunction_1']>
>;
type QueryErrorIsResetFunction_1 = Assert<
	Equal<Actual.QueryErrorIsResetFunction, ExpectedContracts['QueryErrorIsResetFunction_1']>
>;
type QueryErrorResetBoundary_1 = Assert<
	Equal<
		ReturnType<typeof Actual.QueryErrorResetBoundary>,
		ExpectedContracts['QueryErrorResetBoundary_1']
	>
>;
type QueryErrorResetBoundary_2 = Assert<
	Equal<
		Omit<Parameters<typeof Actual.QueryErrorResetBoundary>[0], 'children'>,
		ExpectedContracts['QueryErrorResetBoundary_2']
	>
>;
type QueryErrorResetBoundaryFunction_1 = Assert<
	Equal<
		Parameters<Actual.QueryErrorResetBoundaryFunction>,
		ExpectedContracts['QueryErrorResetBoundaryFunction_1']
	>
>;
type QueryErrorResetBoundaryFunction_2 = Assert<
	Equal<
		ReturnType<Actual.QueryErrorResetBoundaryFunction>,
		ExpectedContracts['QueryErrorResetBoundaryFunction_2']
	>
>;
type QueryErrorResetBoundaryProps_1 = Assert<
	Equal<Actual.QueryErrorResetBoundaryProps, ExpectedContracts['QueryErrorResetBoundaryProps_1']>
>;
type QueryErrorResetFunction_1 = Assert<
	Equal<Actual.QueryErrorResetFunction, ExpectedContracts['QueryErrorResetFunction_1']>
>;
type SuspenseQueriesOptions_1 = Assert<
	Equal<Actual.SuspenseQueriesOptions<never>, ExpectedContracts['SuspenseQueriesOptions_1']>
>;
type SuspenseQueriesResults_1 = Assert<
	Equal<Actual.SuspenseQueriesResults<never>, ExpectedContracts['SuspenseQueriesResults_1']>
>;
type UndefinedInitialDataInfiniteOptions_1 = Assert<
	Equal<
		Actual.UndefinedInitialDataInfiniteOptions<string>,
		ExpectedContracts['UndefinedInitialDataInfiniteOptions_1']
	>
>;
type UndefinedInitialDataOptions_1 = Assert<
	Equal<Actual.UndefinedInitialDataOptions, ExpectedContracts['UndefinedInitialDataOptions_1']>
>;
type UnusedSkipTokenInfiniteOptions_1 = Assert<
	Equal<
		Actual.UnusedSkipTokenInfiniteOptions<string>,
		ExpectedContracts['UnusedSkipTokenInfiniteOptions_1']
	>
>;
type UnusedSkipTokenOptions_1 = Assert<
	Equal<Actual.UnusedSkipTokenOptions, ExpectedContracts['UnusedSkipTokenOptions_1']>
>;
type UseBaseMutationResult_1 = Assert<
	Equal<Actual.UseBaseMutationResult, ExpectedContracts['UseBaseMutationResult_1']>
>;
type UseBaseQueryOptions_1 = Assert<
	Equal<Actual.UseBaseQueryOptions, ExpectedContracts['UseBaseQueryOptions_1']>
>;
type UseBaseQueryResult_1 = Assert<
	Equal<Actual.UseBaseQueryResult, ExpectedContracts['UseBaseQueryResult_1']>
>;
type UseInfiniteQueryOptions_1 = Assert<
	Equal<Actual.UseInfiniteQueryOptions, ExpectedContracts['UseInfiniteQueryOptions_1']>
>;
type UseInfiniteQueryResult_1 = Assert<
	Equal<Actual.UseInfiniteQueryResult, ExpectedContracts['UseInfiniteQueryResult_1']>
>;
type UseMutateAsyncFunction_1 = Assert<
	Equal<Actual.UseMutateAsyncFunction, ExpectedContracts['UseMutateAsyncFunction_1']>
>;
type UseMutateFunction_1 = Assert<
	Equal<Actual.UseMutateFunction, ExpectedContracts['UseMutateFunction_1']>
>;
type UseMutationOptions_1 = Assert<
	Equal<Actual.UseMutationOptions, ExpectedContracts['UseMutationOptions_1']>
>;
type UseMutationResult_1 = Assert<
	Equal<Actual.UseMutationResult, ExpectedContracts['UseMutationResult_1']>
>;
type UsePrefetchInfiniteQueryOptions_1 = Assert<
	Equal<
		Actual.UsePrefetchInfiniteQueryOptions,
		ExpectedContracts['UsePrefetchInfiniteQueryOptions_1']
	>
>;
type UsePrefetchQueryOptions_1 = Assert<
	Equal<Actual.UsePrefetchQueryOptions, ExpectedContracts['UsePrefetchQueryOptions_1']>
>;
type UseQueryOptions_1 = Assert<
	Equal<Actual.UseQueryOptions, ExpectedContracts['UseQueryOptions_1']>
>;
type UseQueryResult_1 = Assert<Equal<Actual.UseQueryResult, ExpectedContracts['UseQueryResult_1']>>;
type UseSuspenseInfiniteQueryOptions_1 = Assert<
	Equal<
		Actual.UseSuspenseInfiniteQueryOptions,
		ExpectedContracts['UseSuspenseInfiniteQueryOptions_1']
	>
>;
type UseSuspenseInfiniteQueryResult_1 = Assert<
	Equal<
		Actual.UseSuspenseInfiniteQueryResult,
		ExpectedContracts['UseSuspenseInfiniteQueryResult_1']
	>
>;
type UseSuspenseQueryOptions_1 = Assert<
	Equal<Actual.UseSuspenseQueryOptions, ExpectedContracts['UseSuspenseQueryOptions_1']>
>;
type UseSuspenseQueryResult_1 = Assert<
	Equal<Actual.UseSuspenseQueryResult, ExpectedContracts['UseSuspenseQueryResult_1']>
>;
type infiniteQueryOptions_1 = Assert<
	Equal<typeof Actual.infiniteQueryOptions, ExpectedContracts['infiniteQueryOptions_1']>
>;
type mutationOptions_1 = Assert<
	Equal<typeof Actual.mutationOptions, ExpectedContracts['mutationOptions_1']>
>;
type queryOptions_1 = Assert<
	Equal<typeof Actual.queryOptions, ExpectedContracts['queryOptions_1']>
>;
type useInfiniteQuery_1 = Assert<
	Equal<typeof Actual.useInfiniteQuery, ExpectedContracts['useInfiniteQuery_1']>
>;
type useIsFetching_1 = Assert<
	Equal<typeof Actual.useIsFetching, ExpectedContracts['useIsFetching_1']>
>;
type useIsMutating_1 = Assert<
	Equal<typeof Actual.useIsMutating, ExpectedContracts['useIsMutating_1']>
>;
type useIsRestoring_1 = Assert<
	Equal<typeof Actual.useIsRestoring, ExpectedContracts['useIsRestoring_1']>
>;
type useMutation_1 = Assert<Equal<typeof Actual.useMutation, ExpectedContracts['useMutation_1']>>;
type useMutationState_1 = Assert<
	Equal<
		ReturnType<
			typeof Actual.useMutationState<Expected.MutationState<number, Error, string, boolean>>
		>,
		ExpectedContracts['useMutationState_1']
	>
>;
type usePrefetchInfiniteQuery_1 = Assert<
	Equal<typeof Actual.usePrefetchInfiniteQuery, ExpectedContracts['usePrefetchInfiniteQuery_1']>
>;
type usePrefetchQuery_1 = Assert<
	Equal<typeof Actual.usePrefetchQuery, ExpectedContracts['usePrefetchQuery_1']>
>;
type useQueries_1 = Assert<
	Equal<
		ReturnType<typeof Actual.useQueries<[{ queryFnData: number }, { queryFnData: string }]>>,
		ExpectedContracts['useQueries_1']
	>
>;
type useQuery_1 = Assert<Equal<typeof Actual.useQuery, ExpectedContracts['useQuery_1']>>;
type useQueryClient_1 = Assert<
	Equal<typeof Actual.useQueryClient, ExpectedContracts['useQueryClient_1']>
>;
type useQueryErrorResetBoundary_1 = Assert<
	Equal<typeof Actual.useQueryErrorResetBoundary, ExpectedContracts['useQueryErrorResetBoundary_1']>
>;
type useSuspenseInfiniteQuery_1 = Assert<
	Equal<typeof Actual.useSuspenseInfiniteQuery, ExpectedContracts['useSuspenseInfiniteQuery_1']>
>;
type useSuspenseQueries_1 = Assert<
	Equal<
		ReturnType<
			typeof Actual.useSuspenseQueries<[{ queryFnData: number }, { queryFnData: string }]>
		>,
		ExpectedContracts['useSuspenseQueries_1']
	>
>;
type useSuspenseQuery_1 = Assert<
	Equal<typeof Actual.useSuspenseQuery, ExpectedContracts['useSuspenseQuery_1']>
>;
type AnyDataTag_1 = Assert<Equal<Actual.AnyDataTag, ExpectedContracts['AnyDataTag_1']>>;
type CancelOptions_1 = Assert<Equal<Actual.CancelOptions, ExpectedContracts['CancelOptions_1']>>;
type CancelledError_1 = Assert<
	Equal<typeof Actual.CancelledError, ExpectedContracts['CancelledError_1']>
>;
type DataTag_1 = Assert<Equal<Actual.DataTag<string, string>, ExpectedContracts['DataTag_1']>>;
type DefaultError_1 = Assert<Equal<Actual.DefaultError, ExpectedContracts['DefaultError_1']>>;
type DefaultOptions_1 = Assert<Equal<Actual.DefaultOptions, ExpectedContracts['DefaultOptions_1']>>;
type DefaultedInfiniteQueryObserverOptions_1 = Assert<
	Equal<
		Actual.DefaultedInfiniteQueryObserverOptions,
		ExpectedContracts['DefaultedInfiniteQueryObserverOptions_1']
	>
>;
type DefaultedQueryObserverOptions_1 = Assert<
	Equal<Actual.DefaultedQueryObserverOptions, ExpectedContracts['DefaultedQueryObserverOptions_1']>
>;
type DefinedInfiniteQueryObserverResult_1 = Assert<
	Equal<
		Actual.DefinedInfiniteQueryObserverResult,
		ExpectedContracts['DefinedInfiniteQueryObserverResult_1']
	>
>;
type DefinedQueryObserverResult_1 = Assert<
	Equal<Actual.DefinedQueryObserverResult, ExpectedContracts['DefinedQueryObserverResult_1']>
>;
type DehydrateOptions_1 = Assert<
	Equal<Actual.DehydrateOptions, ExpectedContracts['DehydrateOptions_1']>
>;
type DehydratedState_1 = Assert<
	Equal<Actual.DehydratedState, ExpectedContracts['DehydratedState_1']>
>;
type DistributiveOmit_1 = Assert<
	Equal<Actual.DistributiveOmit<string, never>, ExpectedContracts['DistributiveOmit_1']>
>;
type EnsureInfiniteQueryDataOptions_1 = Assert<
	Equal<
		Actual.EnsureInfiniteQueryDataOptions,
		ExpectedContracts['EnsureInfiniteQueryDataOptions_1']
	>
>;
type EnsureQueryDataOptions_1 = Assert<
	Equal<Actual.EnsureQueryDataOptions, ExpectedContracts['EnsureQueryDataOptions_1']>
>;
type FetchInfiniteQueryOptions_1 = Assert<
	Equal<Actual.FetchInfiniteQueryOptions, ExpectedContracts['FetchInfiniteQueryOptions_1']>
>;
type FetchNextPageOptions_1 = Assert<
	Equal<Actual.FetchNextPageOptions, ExpectedContracts['FetchNextPageOptions_1']>
>;
type FetchPreviousPageOptions_1 = Assert<
	Equal<Actual.FetchPreviousPageOptions, ExpectedContracts['FetchPreviousPageOptions_1']>
>;
type FetchQueryOptions_1 = Assert<
	Equal<Actual.FetchQueryOptions, ExpectedContracts['FetchQueryOptions_1']>
>;
type FetchStatus_1 = Assert<Equal<Actual.FetchStatus, ExpectedContracts['FetchStatus_1']>>;
type GetNextPageParamFunction_1 = Assert<
	Equal<Actual.GetNextPageParamFunction<string>, ExpectedContracts['GetNextPageParamFunction_1']>
>;
type GetPreviousPageParamFunction_1 = Assert<
	Equal<
		Actual.GetPreviousPageParamFunction<string>,
		ExpectedContracts['GetPreviousPageParamFunction_1']
	>
>;
type HydrateOptions_1 = Assert<Equal<Actual.HydrateOptions, ExpectedContracts['HydrateOptions_1']>>;
type InferDataFromTag_1 = Assert<
	Equal<Actual.InferDataFromTag<string, never>, ExpectedContracts['InferDataFromTag_1']>
>;
type InferErrorFromTag_1 = Assert<
	Equal<Actual.InferErrorFromTag<string, never>, ExpectedContracts['InferErrorFromTag_1']>
>;
type InfiniteData_1 = Assert<
	Equal<Actual.InfiniteData<string>, ExpectedContracts['InfiniteData_1']>
>;
type InfiniteQueryExecuteOptions_1 = Assert<
	Equal<Actual.InfiniteQueryExecuteOptions, ExpectedContracts['InfiniteQueryExecuteOptions_1']>
>;
type InfiniteQueryObserver_1 = Assert<
	Equal<typeof Actual.InfiniteQueryObserver, ExpectedContracts['InfiniteQueryObserver_1']>
>;
type InfiniteQueryObserverBaseResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverBaseResult,
		ExpectedContracts['InfiniteQueryObserverBaseResult_1']
	>
>;
type InfiniteQueryObserverLoadingErrorResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverLoadingErrorResult,
		ExpectedContracts['InfiniteQueryObserverLoadingErrorResult_1']
	>
>;
type InfiniteQueryObserverLoadingResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverLoadingResult,
		ExpectedContracts['InfiniteQueryObserverLoadingResult_1']
	>
>;
type InfiniteQueryObserverOptions_1 = Assert<
	Equal<Actual.InfiniteQueryObserverOptions, ExpectedContracts['InfiniteQueryObserverOptions_1']>
>;
type InfiniteQueryObserverPendingResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverPendingResult,
		ExpectedContracts['InfiniteQueryObserverPendingResult_1']
	>
>;
type InfiniteQueryObserverPlaceholderResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverPlaceholderResult,
		ExpectedContracts['InfiniteQueryObserverPlaceholderResult_1']
	>
>;
type InfiniteQueryObserverRefetchErrorResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverRefetchErrorResult,
		ExpectedContracts['InfiniteQueryObserverRefetchErrorResult_1']
	>
>;
type InfiniteQueryObserverResult_1 = Assert<
	Equal<Actual.InfiniteQueryObserverResult, ExpectedContracts['InfiniteQueryObserverResult_1']>
>;
type InfiniteQueryObserverSuccessResult_1 = Assert<
	Equal<
		Actual.InfiniteQueryObserverSuccessResult,
		ExpectedContracts['InfiniteQueryObserverSuccessResult_1']
	>
>;
type InfiniteQueryPageParamsOptions_1 = Assert<
	Equal<
		Actual.InfiniteQueryPageParamsOptions,
		ExpectedContracts['InfiniteQueryPageParamsOptions_1']
	>
>;
type InitialDataFunction_1 = Assert<
	Equal<Actual.InitialDataFunction<string>, ExpectedContracts['InitialDataFunction_1']>
>;
type InitialPageParam_1 = Assert<
	Equal<Actual.InitialPageParam, ExpectedContracts['InitialPageParam_1']>
>;
type InvalidateOptions_1 = Assert<
	Equal<Actual.InvalidateOptions, ExpectedContracts['InvalidateOptions_1']>
>;
type InvalidateQueryFilters_1 = Assert<
	Equal<Actual.InvalidateQueryFilters, ExpectedContracts['InvalidateQueryFilters_1']>
>;
type ManagedTimerId_1 = Assert<Equal<Actual.ManagedTimerId, ExpectedContracts['ManagedTimerId_1']>>;
type MutateFunction_1 = Assert<Equal<Actual.MutateFunction, ExpectedContracts['MutateFunction_1']>>;
type MutateFunctionRest_1 = Assert<
	Equal<Actual.MutateFunctionRest, ExpectedContracts['MutateFunctionRest_1']>
>;
type MutateOptions_1 = Assert<Equal<Actual.MutateOptions, ExpectedContracts['MutateOptions_1']>>;
type Mutation_1 = Assert<Equal<typeof Actual.Mutation, ExpectedContracts['Mutation_1']>>;
type MutationCache_1 = Assert<
	Equal<typeof Actual.MutationCache, ExpectedContracts['MutationCache_1']>
>;
type MutationCacheConfig_1 = Assert<
	Equal<Actual.MutationCacheConfig, ExpectedContracts['MutationCacheConfig_1']>
>;
type MutationCacheNotifyEvent_1 = Assert<
	Equal<Actual.MutationCacheNotifyEvent, ExpectedContracts['MutationCacheNotifyEvent_1']>
>;
type MutationFilters_1 = Assert<
	Equal<Actual.MutationFilters, ExpectedContracts['MutationFilters_1']>
>;
type MutationFunction_1 = Assert<
	Equal<Actual.MutationFunction, ExpectedContracts['MutationFunction_1']>
>;
type MutationFunctionContext_1 = Assert<
	Equal<Actual.MutationFunctionContext, ExpectedContracts['MutationFunctionContext_1']>
>;
type MutationKey_1 = Assert<Equal<Actual.MutationKey, ExpectedContracts['MutationKey_1']>>;
type MutationMeta_1 = Assert<Equal<Actual.MutationMeta, ExpectedContracts['MutationMeta_1']>>;
type MutationObserver_1 = Assert<
	Equal<typeof Actual.MutationObserver, ExpectedContracts['MutationObserver_1']>
>;
type MutationObserverBaseResult_1 = Assert<
	Equal<Actual.MutationObserverBaseResult, ExpectedContracts['MutationObserverBaseResult_1']>
>;
type MutationObserverErrorResult_1 = Assert<
	Equal<Actual.MutationObserverErrorResult, ExpectedContracts['MutationObserverErrorResult_1']>
>;
type MutationObserverIdleResult_1 = Assert<
	Equal<Actual.MutationObserverIdleResult, ExpectedContracts['MutationObserverIdleResult_1']>
>;
type MutationObserverLoadingResult_1 = Assert<
	Equal<Actual.MutationObserverLoadingResult, ExpectedContracts['MutationObserverLoadingResult_1']>
>;
type MutationObserverOptions_1 = Assert<
	Equal<Actual.MutationObserverOptions, ExpectedContracts['MutationObserverOptions_1']>
>;
type MutationObserverResult_1 = Assert<
	Equal<Actual.MutationObserverResult, ExpectedContracts['MutationObserverResult_1']>
>;
type MutationObserverSuccessResult_1 = Assert<
	Equal<Actual.MutationObserverSuccessResult, ExpectedContracts['MutationObserverSuccessResult_1']>
>;
type MutationOptions_1 = Assert<
	Equal<Actual.MutationOptions, ExpectedContracts['MutationOptions_1']>
>;
type MutationScope_1 = Assert<Equal<Actual.MutationScope, ExpectedContracts['MutationScope_1']>>;
type MutationState_1 = Assert<Equal<Actual.MutationState, ExpectedContracts['MutationState_1']>>;
type MutationStatus_1 = Assert<Equal<Actual.MutationStatus, ExpectedContracts['MutationStatus_1']>>;
type NetworkMode_1 = Assert<Equal<Actual.NetworkMode, ExpectedContracts['NetworkMode_1']>>;
type NonUndefinedGuard_1 = Assert<
	Equal<Actual.NonUndefinedGuard<string>, ExpectedContracts['NonUndefinedGuard_1']>
>;
type NotifyEvent_1 = Assert<Equal<Actual.NotifyEvent, ExpectedContracts['NotifyEvent_1']>>;
type NotifyEventType_1 = Assert<
	Equal<Actual.NotifyEventType, ExpectedContracts['NotifyEventType_1']>
>;
type NotifyOnChangeProps_1 = Assert<
	Equal<Actual.NotifyOnChangeProps, ExpectedContracts['NotifyOnChangeProps_1']>
>;
type OmitKeyof_1 = Assert<Equal<Actual.OmitKeyof<string, never>, ExpectedContracts['OmitKeyof_1']>>;
type Override_1 = Assert<Equal<Actual.Override<string, string>, ExpectedContracts['Override_1']>>;
type PlaceholderDataFunction_1 = Assert<
	Equal<Actual.PlaceholderDataFunction, ExpectedContracts['PlaceholderDataFunction_1']>
>;
type QueriesObserver_1 = Assert<
	Equal<typeof Actual.QueriesObserver, ExpectedContracts['QueriesObserver_1']>
>;
type QueriesObserverOptions_1 = Assert<
	Equal<Actual.QueriesObserverOptions, ExpectedContracts['QueriesObserverOptions_1']>
>;
type QueriesPlaceholderDataFunction_1 = Assert<
	Equal<
		Actual.QueriesPlaceholderDataFunction<string>,
		ExpectedContracts['QueriesPlaceholderDataFunction_1']
	>
>;
type Query_1 = Assert<Equal<typeof Actual.Query, ExpectedContracts['Query_1']>>;
type QueryBooleanOption_1 = Assert<
	Equal<Actual.QueryBooleanOption, ExpectedContracts['QueryBooleanOption_1']>
>;
type QueryCache_1 = Assert<Equal<typeof Actual.QueryCache, ExpectedContracts['QueryCache_1']>>;
type QueryCacheConfig_1 = Assert<
	Equal<Actual.QueryCacheConfig, ExpectedContracts['QueryCacheConfig_1']>
>;
type QueryCacheNotifyEvent_1 = Assert<
	Equal<Actual.QueryCacheNotifyEvent, ExpectedContracts['QueryCacheNotifyEvent_1']>
>;
type QueryClient_1 = Assert<Equal<typeof Actual.QueryClient, ExpectedContracts['QueryClient_1']>>;
type QueryClientConfig_1 = Assert<
	Equal<Actual.QueryClientConfig, ExpectedContracts['QueryClientConfig_1']>
>;
type QueryExecuteOptions_1 = Assert<
	Equal<Actual.QueryExecuteOptions, ExpectedContracts['QueryExecuteOptions_1']>
>;
type QueryFilters_1 = Assert<Equal<Actual.QueryFilters, ExpectedContracts['QueryFilters_1']>>;
type QueryFunction_1 = Assert<Equal<Actual.QueryFunction, ExpectedContracts['QueryFunction_1']>>;
type QueryFunctionContext_1 = Assert<
	Equal<Actual.QueryFunctionContext, ExpectedContracts['QueryFunctionContext_1']>
>;
type QueryKey_1 = Assert<Equal<Actual.QueryKey, ExpectedContracts['QueryKey_1']>>;
type QueryKeyHashFunction_1 = Assert<
	Equal<Actual.QueryKeyHashFunction<never>, ExpectedContracts['QueryKeyHashFunction_1']>
>;
type QueryKeyWithDataTag_1 = Assert<
	Equal<Actual.QueryKeyWithDataTag, ExpectedContracts['QueryKeyWithDataTag_1']>
>;
type QueryMeta_1 = Assert<Equal<Actual.QueryMeta, ExpectedContracts['QueryMeta_1']>>;
type QueryObserver_1 = Assert<
	Equal<typeof Actual.QueryObserver, ExpectedContracts['QueryObserver_1']>
>;
type QueryObserverBaseResult_1 = Assert<
	Equal<Actual.QueryObserverBaseResult, ExpectedContracts['QueryObserverBaseResult_1']>
>;
type QueryObserverLoadingErrorResult_1 = Assert<
	Equal<
		Actual.QueryObserverLoadingErrorResult,
		ExpectedContracts['QueryObserverLoadingErrorResult_1']
	>
>;
type QueryObserverLoadingResult_1 = Assert<
	Equal<Actual.QueryObserverLoadingResult, ExpectedContracts['QueryObserverLoadingResult_1']>
>;
type QueryObserverOptions_1 = Assert<
	Equal<Actual.QueryObserverOptions, ExpectedContracts['QueryObserverOptions_1']>
>;
type QueryObserverPendingResult_1 = Assert<
	Equal<Actual.QueryObserverPendingResult, ExpectedContracts['QueryObserverPendingResult_1']>
>;
type QueryObserverPlaceholderResult_1 = Assert<
	Equal<
		Actual.QueryObserverPlaceholderResult,
		ExpectedContracts['QueryObserverPlaceholderResult_1']
	>
>;
type QueryObserverRefetchErrorResult_1 = Assert<
	Equal<
		Actual.QueryObserverRefetchErrorResult,
		ExpectedContracts['QueryObserverRefetchErrorResult_1']
	>
>;
type QueryObserverResult_1 = Assert<
	Equal<Actual.QueryObserverResult, ExpectedContracts['QueryObserverResult_1']>
>;
type QueryObserverSuccessResult_1 = Assert<
	Equal<Actual.QueryObserverSuccessResult, ExpectedContracts['QueryObserverSuccessResult_1']>
>;
type QueryOptions_1 = Assert<Equal<Actual.QueryOptions, ExpectedContracts['QueryOptions_1']>>;
type QueryPersister_1 = Assert<Equal<Actual.QueryPersister, ExpectedContracts['QueryPersister_1']>>;
type QueryState_1 = Assert<Equal<Actual.QueryState, ExpectedContracts['QueryState_1']>>;
type QueryStatus_1 = Assert<Equal<Actual.QueryStatus, ExpectedContracts['QueryStatus_1']>>;
type RefetchOptions_1 = Assert<Equal<Actual.RefetchOptions, ExpectedContracts['RefetchOptions_1']>>;
type RefetchQueryFilters_1 = Assert<
	Equal<Actual.RefetchQueryFilters, ExpectedContracts['RefetchQueryFilters_1']>
>;
type Register_1 = Assert<Equal<Actual.Register, ExpectedContracts['Register_1']>>;
type ResetOptions_1 = Assert<Equal<Actual.ResetOptions, ExpectedContracts['ResetOptions_1']>>;
type ResultOptions_1 = Assert<Equal<Actual.ResultOptions, ExpectedContracts['ResultOptions_1']>>;
type SetDataOptions_1 = Assert<Equal<Actual.SetDataOptions, ExpectedContracts['SetDataOptions_1']>>;
type SkipToken_1 = Assert<Equal<Actual.SkipToken, ExpectedContracts['SkipToken_1']>>;
type StaleTime_1 = Assert<Equal<Actual.StaleTime, ExpectedContracts['StaleTime_1']>>;
type StaleTimeFunction_1 = Assert<
	Equal<Actual.StaleTimeFunction, ExpectedContracts['StaleTimeFunction_1']>
>;
type ThrowOnError_1 = Assert<
	Equal<Actual.ThrowOnError<string, string, string, never>, ExpectedContracts['ThrowOnError_1']>
>;
type TimeoutCallback_1 = Assert<
	Equal<Actual.TimeoutCallback, ExpectedContracts['TimeoutCallback_1']>
>;
type TimeoutProvider_1 = Assert<
	Equal<Actual.TimeoutProvider, ExpectedContracts['TimeoutProvider_1']>
>;
type UnsetMarker_1 = Assert<Equal<Actual.UnsetMarker, ExpectedContracts['UnsetMarker_1']>>;
type Updater_1 = Assert<Equal<Actual.Updater<string, string>, ExpectedContracts['Updater_1']>>;
type WithRequired_1 = Assert<
	Equal<Actual.WithRequired<string, never>, ExpectedContracts['WithRequired_1']>
>;
type dataTagErrorSymbol_1 = Assert<
	Equal<typeof Actual.dataTagErrorSymbol, ExpectedContracts['dataTagErrorSymbol_1']>
>;
type dataTagSymbol_1 = Assert<
	Equal<typeof Actual.dataTagSymbol, ExpectedContracts['dataTagSymbol_1']>
>;
type defaultScheduler_1 = Assert<
	Equal<typeof Actual.defaultScheduler, ExpectedContracts['defaultScheduler_1']>
>;
type defaultShouldDehydrateMutation_1 = Assert<
	Equal<
		typeof Actual.defaultShouldDehydrateMutation,
		ExpectedContracts['defaultShouldDehydrateMutation_1']
	>
>;
type defaultShouldDehydrateQuery_1 = Assert<
	Equal<
		typeof Actual.defaultShouldDehydrateQuery,
		ExpectedContracts['defaultShouldDehydrateQuery_1']
	>
>;
type dehydrate_1 = Assert<Equal<typeof Actual.dehydrate, ExpectedContracts['dehydrate_1']>>;
type dehydrateQuery_1 = Assert<
	Equal<typeof Actual.dehydrateQuery, ExpectedContracts['dehydrateQuery_1']>
>;
type environmentManager_1 = Assert<
	Equal<typeof Actual.environmentManager, ExpectedContracts['environmentManager_1']>
>;
type experimental_streamedQuery_1 = Assert<
	Equal<typeof Actual.experimental_streamedQuery, ExpectedContracts['experimental_streamedQuery_1']>
>;
type focusManager_1 = Assert<
	Equal<typeof Actual.focusManager, ExpectedContracts['focusManager_1']>
>;
type hashKey_1 = Assert<Equal<typeof Actual.hashKey, ExpectedContracts['hashKey_1']>>;
type hydrate_1 = Assert<Equal<typeof Actual.hydrate, ExpectedContracts['hydrate_1']>>;
type isCancelledError_1 = Assert<
	Equal<typeof Actual.isCancelledError, ExpectedContracts['isCancelledError_1']>
>;
type isServer_1 = Assert<Equal<typeof Actual.isServer, ExpectedContracts['isServer_1']>>;
type keepPreviousData_1 = Assert<
	Equal<typeof Actual.keepPreviousData, ExpectedContracts['keepPreviousData_1']>
>;
type matchMutation_1 = Assert<
	Equal<typeof Actual.matchMutation, ExpectedContracts['matchMutation_1']>
>;
type matchQuery_1 = Assert<Equal<typeof Actual.matchQuery, ExpectedContracts['matchQuery_1']>>;
type noop_1 = Assert<Equal<typeof Actual.noop, ExpectedContracts['noop_1']>>;
type notifyManager_1 = Assert<
	Equal<typeof Actual.notifyManager, ExpectedContracts['notifyManager_1']>
>;
type onlineManager_1 = Assert<
	Equal<typeof Actual.onlineManager, ExpectedContracts['onlineManager_1']>
>;
type partialMatchKey_1 = Assert<
	Equal<typeof Actual.partialMatchKey, ExpectedContracts['partialMatchKey_1']>
>;
type replaceEqualDeep_1 = Assert<
	Equal<typeof Actual.replaceEqualDeep, ExpectedContracts['replaceEqualDeep_1']>
>;
type shouldThrowError_1 = Assert<
	Equal<typeof Actual.shouldThrowError, ExpectedContracts['shouldThrowError_1']>
>;
type skipToken_1 = Assert<Equal<typeof Actual.skipToken, ExpectedContracts['skipToken_1']>>;
type timeoutManager_1 = Assert<
	Equal<typeof Actual.timeoutManager, ExpectedContracts['timeoutManager_1']>
>;
type unsetMarker_1 = Assert<Equal<typeof Actual.unsetMarker, ExpectedContracts['unsetMarker_1']>>;

const options = Actual.queryOptions({
	queryKey: ['user'] as const,
	queryFn: async () => ({ name: 'Ada' }),
});
const result = Actual.useQuery(options);
expectTypeOf(result.data).toEqualTypeOf<{ name: string } | undefined>();
// @ts-expect-error query keys must be arrays
Actual.useQuery({ queryKey: 1 });
// @ts-expect-error hydrated state is required even when explicitly undefined
Actual.HydrationBoundary({});
// @ts-expect-error the removed experimental promise is not part of Query 5.102
result.promise;
// @ts-expect-error prefetch functions do not accept skipToken
Actual.usePrefetchQuery({ queryKey: ['skip'], queryFn: Actual.skipToken });

type QueryErrorResetBoundaryValue_1 = Assert<
	Equal<Actual.QueryErrorResetBoundaryValue, ExpectedContracts['QueryErrorResetBoundaryValue_1']>
>;
