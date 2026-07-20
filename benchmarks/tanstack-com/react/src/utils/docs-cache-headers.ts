import { findLibrary, getBranch } from '~/libraries';
import { docsContentNegotiationVaryHeader } from './http';

const latestDocsCdnCacheControl = 'public, max-age=60, stale-while-revalidate=60';
const versionedDocsCdnCacheControl = 'public, max-age=300, stale-while-revalidate=300';

export function getDocsCacheHeaders({
	libraryId,
	version,
}: {
	libraryId: string;
	version: string;
}) {
	const library = findLibrary(libraryId);
	const branch = library ? getBranch(library, version) : null;
	const isLatestVersion =
		library &&
		(version === 'latest' || version === library.latestVersion || version === library.latestBranch);
	const cacheTags = library
		? ['docs:all', `docs:${library.id}`, `docs:${library.id}:branch:${branch}`]
		: ['docs:all'];

	return {
		'Cache-Control': isLatestVersion
			? 'public, max-age=60, must-revalidate'
			: 'public, max-age=300, must-revalidate',
		'Cloudflare-CDN-Cache-Control': isLatestVersion
			? latestDocsCdnCacheControl
			: versionedDocsCdnCacheControl,
		'Cache-Tag': cacheTags.join(','),
		Vary: docsContentNegotiationVaryHeader,
	};
}
