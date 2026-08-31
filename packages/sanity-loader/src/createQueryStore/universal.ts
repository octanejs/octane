import type { QueryParams } from '@sanity/client';
import {
	createQueryStore as createCoreQueryStore,
	type CreateQueryStoreOptions,
} from '@sanity/core-loader';

import { defineStudioUrlStore } from '../defineStudioUrlStore';
import { defineUseLiveMode } from '../defineUseLiveMode';
import { defineUseQuery } from '../defineUseQuery';
import type {
	NonUndefinedGuard,
	QueryResponseInitial,
	QueryStore,
	UseLiveModeHook,
	UseQueryOptionsDefinedInitial,
	UseQueryOptionsUndefinedInitial,
} from '../types';

export type * from '../types';

export const createQueryStore = (options: CreateQueryStoreOptions): QueryStore => {
	const {
		createFetcherStore,
		setServerClient,
		enableLiveMode,
		unstable__cache,
		unstable__serverClient,
	} = createCoreQueryStore({ tag: 'octane-loader', ...options });
	const studioUrlStore = defineStudioUrlStore(options.client);
	const useQuery = defineUseQuery({ createFetcherStore, studioUrlStore }) as QueryStore['useQuery'];
	const useLiveMode: UseLiveModeHook = defineUseLiveMode({
		enableLiveMode,
		setStudioUrl: studioUrlStore.setStudioUrl,
	});

	const loadQuery = async <QueryResponseResult>(
		query: string,
		params: QueryParams = {},
		loadOptions: Parameters<QueryStore['loadQuery']>[2] = {},
	): Promise<QueryResponseInitial<QueryResponseResult>> => {
		const { headers, tag } = loadOptions;
		const stega =
			typeof loadOptions.stega === 'boolean'
				? loadOptions.stega
				: (loadOptions.stega?.enabled ??
					unstable__serverClient.instance?.config().stega?.enabled ??
					false);
		const perspective =
			loadOptions.perspective ||
			unstable__serverClient.instance?.config().perspective ||
			'published';
		const variant = loadOptions.variant || undefined;

		if (typeof document !== 'undefined') {
			throw new Error('Cannot use `loadQuery` in a browser environment.');
		}
		if (perspective !== 'published' && !unstable__serverClient.instance) {
			throw new Error(
				'You cannot use other perspectives than "published" unless you set "ssr: true" and call "setServerClient" first.',
			);
		}
		if (Array.isArray(perspective) || perspective === 'drafts' || perspective === 'previewDrafts') {
			if (!unstable__serverClient.canPreviewDrafts) {
				throw new Error(
					`You cannot use 'perspective: ${JSON.stringify(perspective)}' without a token in the server client.`,
				);
			}

			const { result, resultSourceMap } =
				await unstable__serverClient.instance!.fetch<QueryResponseResult>(query, params, {
					filterResponse: false,
					resultSourceMap: 'withKeyArraySelector',
					stega,
					perspective,
					variant,
					useCdn: false,
					headers,
					tag,
				});
			return resultSourceMap
				? { data: result, sourceMap: resultSourceMap, perspective, variant }
				: ({ data: result, perspective, variant } as QueryResponseInitial<QueryResponseResult>);
		}

		const { result, resultSourceMap } = await unstable__cache.instance.fetch<QueryResponseResult>(
			JSON.stringify({ query, params, perspective, variant, options: { stega } }),
		);
		return resultSourceMap
			? { data: result, sourceMap: resultSourceMap }
			: ({ data: result } as QueryResponseInitial<QueryResponseResult>);
	};

	return {
		loadQuery,
		useQuery,
		setServerClient,
		useLiveMode,
	};
};

export type {
	NonUndefinedGuard,
	QueryResponseInitial,
	QueryStore,
	UseLiveModeHook,
	UseQueryOptionsDefinedInitial,
	UseQueryOptionsUndefinedInitial,
};

export const { loadQuery, setServerClient, useLiveMode, useQuery } = createQueryStore({
	client: false,
	ssr: true,
});
