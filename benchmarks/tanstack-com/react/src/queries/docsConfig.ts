import { queryOptions } from '@tanstack/react-query';
import { getBranch, getLibrary, type LibraryId } from '~/libraries';
import { getTanstackDocsConfig } from '~/utils/config';

function getDocsConfigRequest(libraryId: LibraryId, version: string) {
	const library = getLibrary(libraryId);
	const branch = getBranch(library, version);
	const docsRoot = library.docsRoot || 'docs';

	return {
		branch,
		docsRoot,
		repo: library.repo,
	};
}

export function docsConfigQueryOptions(libraryId: LibraryId, version: string) {
	const request = getDocsConfigRequest(libraryId, version);

	return queryOptions({
		queryKey: ['docs-config', request.repo, request.branch, request.docsRoot],
		queryFn: () => getTanstackDocsConfig({ data: request }),
		staleTime: 1000 * 60 * 5,
	});
}
