import { Outlet, notFound, createFileRoute } from '@tanstack/react-router';
import { findLibrary } from '~/libraries';
import { seo } from '~/utils/seo';
import { getDocsCacheHeaders } from '~/utils/docs-cache-headers';

export const Route = createFileRoute('/_library/$libraryId/$version/docs')({
	head: (ctx) => {
		const { libraryId } = ctx.params;
		const library = findLibrary(libraryId);

		if (!library) {
			throw notFound();
		}

		return {
			meta: seo({
				title: `${library.name} Docs`,
				noindex: library.visible === false,
			}),
		};
	},
	component: DocsRoute,
	headers: ({ params }) => {
		const { libraryId, version } = params;

		return getDocsCacheHeaders({ libraryId, version });
	},
});

function DocsRoute() {
	return <Outlet />;
}
