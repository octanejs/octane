import { Link, redirect } from '@octanejs/tanstack-router';
import type { QueryClient } from '@octanejs/tanstack-query';
import { getLibrary } from '~/libraries';
import type { LibraryId } from '~/libraries';
import { docsConfigQueryOptions } from '~/queries/docsConfig';
import { ossStatsQuery, recentDownloadsQuery } from '~/queries/stats';
import { ogImageUrl } from '~/utils/og';
import { seo } from '~/utils/seo';
import { stackBlitzEmbedHeaders } from '~/utils/stackblitz-embed';
import { validateLibraryVersion } from './-library-landing';
import type { LandingLibraryId } from './-library-landing';
import type { ConfigSchema } from '~/utils/config';

const stackBlitzLandingLibraryIds = new Set<LibraryId>([
	'form',
	'query',
	'ranger',
	'router',
	'table',
	'virtual',
]);

export const libraryLandingStaleTime = 1000 * 60 * 5;

export function beforeLoadLibraryLanding(
	libraryId: LandingLibraryId,
	version: string | undefined,
	href: string,
) {
	const library = validateLibraryVersion(libraryId, version, () => {
		throw redirect({ href: `/${libraryId}/latest` });
	});

	library.handleRedirects?.(href);
}

export async function loadLibraryLandingRouteData(
	libraryId: LandingLibraryId,
	version: string,
	queryClient: QueryClient,
): Promise<{
	config: ConfigSchema;
}> {
	const library = getLibrary(libraryId);
	const [config] = await Promise.all([
		queryClient.ensureQueryData(docsConfigQueryOptions(libraryId, version)),
		queryClient.ensureQueryData(ossStatsQuery({ library })),
		queryClient.ensureQueryData(recentDownloadsQuery({ library })),
	]);

	return {
		config,
	};
}

export function getLibraryLandingHead(libraryId: LandingLibraryId) {
	const library = getLibrary(libraryId);

	return {
		meta: seo({
			title: library.name,
			description: library.description,
			image: ogImageUrl(library.id),
			noindex: library.visible === false,
		}),
	};
}

export function getLibraryLandingHeaders(libraryId: LandingLibraryId) {
	return stackBlitzLandingLibraryIds.has(libraryId) ? stackBlitzEmbedHeaders : {};
}

export function LibraryNavbarTitle({ libraryId }: { libraryId: LandingLibraryId }) {
	const library = getLibrary(libraryId);
	const libraryName = library.name.replace('TanStack ', '');
	const gradientText = `inline-block text-transparent bg-clip-text bg-linear-to-r ${library.colorFrom} ${library.colorTo}`;

	return <Link to="/$libraryId" params={{ libraryId: library.id }} className="whitespace-nowrap">
		<span class={gradientText}>{libraryName as string}</span>
	</Link>;
}
