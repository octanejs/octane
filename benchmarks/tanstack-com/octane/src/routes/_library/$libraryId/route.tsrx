import { Link, createFileRoute } from '@octanejs/tanstack-router';
import { notFound, Outlet, useParams } from '@octanejs/tanstack-router';
import { Scarf } from '~/components/Scarf.tsrx';
import { findLibrary, type LibraryId } from '~/libraries';
import { seo } from '~/utils/seo';
import { ogImageUrl } from '~/utils/og';

export const Route = createFileRoute('/_library/$libraryId')({
	params: {
		parse: (params) => {
			return params as { libraryId: LibraryId };
		},
	},
	beforeLoad: (ctx) => {
		const library = findLibrary(ctx.params.libraryId);

		if (!library) {
			throw notFound();
		}
	},
	loader: (ctx) => {
		const library = findLibrary(ctx.params.libraryId);

		if (!library) {
			throw notFound();
		}
	},
	head: (ctx) => {
		const library = findLibrary(ctx.params.libraryId);

		if (!library) {
			return {
				meta: seo({
					title: '404 Not Found',
				}),
			};
		}

		return {
			meta: seo({
				title: library.name
					? `${library.name} | ${library.frameworks.map(
							(framework) => `${framework.charAt(0).toUpperCase()}${framework.slice(
								1,
							)} ${library.name.replace('TanStack ', '')}`,
						).join(', ')}`
					: '',
				description: library.description,
				image: ogImageUrl(library.id),
				noindex: library.visible === false,
			}),
		};
	},
	component: RouteForm,
	staticData: {
		Title: () => {
			const { libraryId } = Route.useParams();
			const { version } = useParams({ strict: false });
			const library = findLibrary(libraryId);

			if (!library) {
				return null;
			}

			const libraryName = library.name.replace('TanStack ', '');
			const resolvedVersion =
				version === 'latest' ? library.latestVersion : version!;
			const gradientText = `inline-block text-transparent bg-clip-text bg-linear-to-r ${library.colorFrom} ${library.colorTo}`;
			return <Link to={`/$libraryId`} params={{ libraryId }} className="relative whitespace-nowrap">
				<span class={`${gradientText}`}>{libraryName}</span>
				{' '}
				<span
					class="text-sm absolute right-0 top-0 font-normal normal-case"
				>{resolvedVersion}</span>
				<span class="text-sm opacity-0 normal-case">{resolvedVersion}</span>
			</Link>;
		},
	},
});

function RouteForm() {
	const { libraryId } = Route.useParams();
	const library = findLibrary(libraryId);

	if (!library) {
		return null;
	}

	return <>
		<Outlet />
		{library?.scarfId ? <Scarf id={library.scarfId} /> : null}
	</>;
}
