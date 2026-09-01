import {
	defineEncodeDataAttribute,
	type EncodeDataAttributeFunction,
} from '@sanity/core-loader/encode-data-attribute';
import { useMemo } from 'octane';

export type EncodeDataAttributeCallback = (
	path: import('@sanity/client/csm').StudioPathLike,
) => string | undefined;

export function useEncodeDataAttribute<QueryResponseResult = unknown>(
	result: QueryResponseResult,
	sourceMap: import('@sanity/client/csm').ContentSourceMap | undefined,
	studioUrl:
		| import('@sanity/client/csm').StudioUrl
		| import('@sanity/client/csm').ResolveStudioUrl
		| undefined,
): EncodeDataAttributeFunction {
	return useMemo(
		() => defineEncodeDataAttribute(result, sourceMap, studioUrl),
		[result, sourceMap, studioUrl],
	);
}
