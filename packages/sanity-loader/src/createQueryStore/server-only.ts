import type { ClientPerspective, ContentSourceMap, QueryParams } from '@sanity/client';
import {
	createQueryStore as createCoreQueryStore,
	type CreateQueryStoreOptions,
} from '@sanity/core-loader';

import type { QueryStore } from '../types';

export type * from '../types';

export const createQueryStore = (options: CreateQueryStoreOptions): QueryStore => {
	if (!options.ssr) {
		throw new Error('When using the server-only entry, the `ssr` option must be `true`.');
	}
	const { setServerClient, unstable__serverClient } = createCoreQueryStore({
		tag: 'octane-loader.rsc',
		...options,
	});

	const loadQuery = async <QueryResponseResult>(
		query: string,
		params: QueryParams = {},
		loadOptions: Parameters<QueryStore['loadQuery']>[2] = {},
	): Promise<{
		data: QueryResponseResult;
		sourceMap: ContentSourceMap | undefined;
		perspective?: ClientPerspective;
		variant?: string;
	}> => {
		const { cache, next, stega, headers, tag } = loadOptions;
		const perspective =
			loadOptions.perspective ||
			unstable__serverClient.instance?.config().perspective ||
			'published';
		const variant = loadOptions.variant || undefined;
		const useCdn = loadOptions.useCdn ?? unstable__serverClient.instance!.config().useCdn;
		const previewPerspective =
			Array.isArray(perspective) || perspective === 'drafts' || perspective === 'previewDrafts';

		if (previewPerspective && !unstable__serverClient.canPreviewDrafts) {
			throw new Error(
				`You cannot use 'perspective: ${JSON.stringify(perspective)}' without a token in the server client.`,
			);
		}

		const response = await unstable__serverClient.instance!.fetch<QueryResponseResult>(
			query,
			params,
			{
				cache: (cache ?? next) ? undefined : ('no-store' as never),
				filterResponse: false,
				next,
				perspective,
				variant,
				useCdn: previewPerspective ? false : useCdn,
				stega,
				headers,
				tag,
			},
		);
		const { result, resultSourceMap } = response as unknown as {
			result: QueryResponseResult;
			resultSourceMap: ContentSourceMap | undefined;
		};
		const payload = (
			resultSourceMap ? { data: result, sourceMap: resultSourceMap } : { data: result }
		) as {
			data: QueryResponseResult;
			sourceMap: ContentSourceMap | undefined;
		};
		if (previewPerspective) return { ...payload, perspective, variant };
		if (variant) return { ...payload, variant };
		return payload;
	};

	const useQuery: QueryStore['useQuery'] = () => {
		throw new Error('The `useQuery` hook can only be called from a client component.');
	};
	const useLiveMode: QueryStore['useLiveMode'] = () => {
		throw new Error('The `useLiveMode` hook can only be called from a client component.');
	};

	return { loadQuery, setServerClient, useQuery, useLiveMode };
};

export const { loadQuery, setServerClient, useLiveMode, useQuery } = createQueryStore({
	client: false,
	ssr: true,
});
