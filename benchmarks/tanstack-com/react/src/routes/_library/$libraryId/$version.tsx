import { Outlet, redirect, notFound, createFileRoute } from '@tanstack/react-router';
import { RedirectVersionBanner } from '~/components/RedirectVersionBanner';
import { findLibrary } from '~/libraries';
import { docsConfigQueryOptions } from '~/queries/docsConfig';
import { validateLibraryVersion } from '../../-library-landing';

export const Route = createFileRoute('/_library/$libraryId/$version')({
	staleTime: 1000 * 60 * 5,
	beforeLoad: async (ctx) => {
		const { libraryId, version } = ctx.params;
		const library = validateLibraryVersion(libraryId, version, () => {
			throw redirect({
				params: { libraryId, version: 'latest' } as never,
			});
		});

		library.handleRedirects?.(ctx.location.href);
	},
	loader: async (ctx) => {
		const { libraryId, version } = ctx.params;
		const library = findLibrary(libraryId);

		if (!library) {
			throw notFound();
		}

		return {
			config: await ctx.context.queryClient.ensureQueryData(
				docsConfigQueryOptions(library.id, version!),
			),
		};
	},
	component: RouteForm,
});

function RouteForm() {
	const { libraryId, version } = Route.useParams();
	const library = findLibrary(libraryId);

	if (!library) {
		throw notFound();
	}

	return (
		<>
			<Outlet />
			<RedirectVersionBanner version={version!} latestVersion={library.latestVersion} />
		</>
	);
}
