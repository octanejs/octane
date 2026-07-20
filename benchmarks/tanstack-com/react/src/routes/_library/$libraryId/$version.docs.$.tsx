import { seo } from '~/utils/seo';
import { ogImageUrl } from '~/utils/og';
import { Doc } from '~/components/Doc';
import { buildDocsRedirectHref, loadDocsRoute } from '~/utils/docs';
import { findLibrary, getBranch, getLibrary } from '~/libraries';
import { DocContainer } from '~/components/DocContainer';
import { getDocsCacheHeaders } from '~/utils/docs-cache-headers';
import { notFound, redirect, useLocation, useMatch, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_library/$libraryId/$version/docs/$')({
	staleTime: 1000 * 60 * 5,
	loader: async (ctx) => {
		const { _splat: docsPath, version, libraryId } = ctx.params;
		const library = findLibrary(libraryId);

		if (!library) {
			throw notFound();
		}

		const branch = getBranch(library, version);
		const docsRoot = library.docsRoot || 'docs';
		const requestedDocsPath = docsPath ?? '';
		const result = await loadDocsRoute({
			repo: library.repo,
			branch,
			docsRoot,
			docsPath: requestedDocsPath,
			defaultDocs: library.defaultDocs ?? 'overview',
			frameworks: library.frameworks,
			redirectFromPaths: requestedDocsPath ? [requestedDocsPath] : [],
		});

		if (result.type === 'redirect') {
			throw redirect({
				href: buildDocsRedirectHref({
					baseHref: ctx.location.href,
					docsPath: result.docsPath,
					libraryId,
					version,
				}),
				statusCode: 308,
			});
		}

		if (result.type === 'not-found') {
			throw notFound();
		}

		return result.doc;
	},
	head: ({ loaderData, params }) => {
		const { libraryId, version, _splat: docsPath } = params;
		const library = findLibrary(libraryId);

		if (!library) {
			throw notFound();
		}

		const frameworkVariantLinks = (loaderData?.frameworks ?? []).map((framework) => ({
			rel: 'alternate',
			type: 'text/markdown',
			href: `/${libraryId}/${version}/docs/${docsPath}.md?framework=${framework}`,
		}));

		return {
			meta: seo({
				title: `${loaderData?.title} | ${library.name} Docs`,
				description: loaderData?.description,
				keywords: loaderData?.keywords,
				image: ogImageUrl(library.id, {
					title: loaderData?.title,
					description: loaderData?.description,
				}),
				noindex: library.visible === false,
			}),
			links: frameworkVariantLinks,
		};
	},
	component: Docs,
	headers: ({ params }) => {
		const { version, libraryId } = params;

		return getDocsCacheHeaders({ libraryId, version });
	},
});

function Docs() {
	const { version, libraryId, _splat } = Route.useParams();
	const { content, filePath, title } = Route.useLoaderData();
	const versionMatch = useMatch({ from: '/_library/$libraryId/$version' });
	const config = versionMatch.loaderData?.config;
	const library = getLibrary(libraryId);
	const branch = getBranch(library, version);
	const location = useLocation();

	return (
		<DocContainer>
			<Doc
				title={title}
				content={content}
				repo={library.repo}
				branch={branch}
				filePath={filePath}
				colorFrom={library.colorFrom}
				colorTo={library.colorTo}
				textColor={library.textColor}
				shouldRenderToc
				libraryId={libraryId}
				libraryVersion={version === 'latest' ? library.latestVersion : version}
				pagePath={location.pathname}
				config={config}
			/>
		</DocContainer>
	);
}
