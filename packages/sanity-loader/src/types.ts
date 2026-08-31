import type {
	ClientPerspective,
	ContentSourceMap,
	QueryParams,
	ResponseQueryOptions,
} from '@sanity/client';
import type {
	createQueryStore as createCoreQueryStore,
	EnableLiveModeOptions,
	QueryStoreState,
} from '@sanity/core-loader';
import type { EncodeDataAttributeFunction } from '@sanity/core-loader/encode-data-attribute';

export type * from '@sanity/core-loader';

type WithEncodeDataAttribute = {
	encodeDataAttribute: EncodeDataAttributeFunction;
};

export type UseQueryHook = <QueryResponseResult = unknown, QueryResponseError = unknown>(
	query: string,
	params?: QueryParams,
	options?: UseQueryOptions<QueryResponseResult>,
) => QueryStoreState<QueryResponseResult, QueryResponseError> & WithEncodeDataAttribute;

export interface QueryResponseInitial<QueryResponseResult> {
	data: QueryResponseResult;
	sourceMap: ContentSourceMap | undefined;
	perspective?: ClientPerspective;
	variant?: string;
}

export interface UseQueryOptions<QueryResponseResult = unknown> {
	initial?: QueryResponseInitial<QueryResponseResult>;
}

export interface UseQueryOptionsUndefinedInitial {
	initial?: undefined;
}

export type NonUndefinedGuard<T> = T extends undefined ? never : T;

export interface UseQueryOptionsDefinedInitial<QueryResponseResult = unknown> {
	initial: NonUndefinedGuard<QueryResponseInitial<QueryResponseResult>>;
}

export type UseLiveModeHook = (
	options: EnableLiveModeOptions & {
		studioUrl?:
			| import('@sanity/client/csm').StudioUrl
			| import('@sanity/client/csm').ResolveStudioUrl
			| undefined;
	},
) => void;

export interface QueryStore {
	loadQuery: <QueryResponseResult>(
		query: string,
		params?: QueryParams,
		options?: Pick<
			ResponseQueryOptions,
			'perspective' | 'cache' | 'next' | 'useCdn' | 'stega' | 'tag' | 'headers'
		> & {
			variant?: string;
		},
	) => Promise<QueryResponseInitial<QueryResponseResult>>;
	setServerClient: ReturnType<typeof createCoreQueryStore>['setServerClient'];
	useQuery: {
		<QueryResponseResult = unknown, QueryResponseError = unknown>(
			query: string,
			params?: QueryParams,
			options?: UseQueryOptionsUndefinedInitial,
		): QueryStoreState<QueryResponseResult, QueryResponseError> & WithEncodeDataAttribute;
		<QueryResponseResult = unknown, QueryResponseError = unknown>(
			query: string,
			params?: QueryParams,
			options?: UseQueryOptionsDefinedInitial<QueryResponseResult>,
		): Omit<QueryStoreState<QueryResponseResult, QueryResponseError>, 'data'> & {
			data: QueryResponseResult;
		} & WithEncodeDataAttribute;
	};
	useLiveMode: UseLiveModeHook;
}
