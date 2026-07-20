import { redirect, useLocation, useMatch, createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
import { ogImageUrl } from '~/utils/og';
import { Doc } from '~/components/Doc';
import { buildDocsRedirectHref, loadDocsRoute } from '~/utils/docs';
import { getBranch, getLibrary } from '~/libraries';
import { capitalize } from '~/utils/utils';
import { DocContainer } from '~/components/DocContainer';
import { getDocsCacheHeaders } from '~/utils/docs-cache-headers';

export const Route = createFileRoute('/_library/$libraryId/$version/docs/framework/$framework/$')({
	staleTime: 1000 * 60 * 5,
	loader: async (ctx) => {
		const { _splat: docsPath, framework, version, libraryId } = ctx.params;

		const library = getLibrary(libraryId);
		const branch = getBranch(library, version);
		const docsRoot = library.docsRoot || 'docs';
		const requestedDocsPath = `framework/${framework}/${docsPath ?? ''}`;
		const result = await loadDocsRoute({
			repo: library.repo,
			branch,
			docsRoot,
			docsPath: requestedDocsPath,
			defaultDocs: library.defaultDocs ?? 'overview',
			frameworks: library.frameworks,
			redirectFromPaths: docsPath
				? [requestedDocsPath, `${framework}/${docsPath}`]
				: [requestedDocsPath],
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
			throw redirect({
				to: '/$libraryId/$version/docs/framework/$framework',
				params: { libraryId, version, framework },
			});
		}

		return result.doc;
	},
	component: Docs,
	headers: ({ params }) => {
		const { libraryId, version } = params;

		return getDocsCacheHeaders({ libraryId, version });
	},
	head: (ctx) => {
		const library = getLibrary(ctx.params.libraryId);
		const tail = `${library.name} ${capitalize(ctx.params.framework)} Docs`;

		return {
			meta: seo({
				title: ctx.loaderData?.title ? `${ctx.loaderData.title} | ${tail}` : tail,
				description: ctx.loaderData?.description,
				keywords: ctx.loaderData?.keywords,
				image: ogImageUrl(library.id, {
					title: ctx.loaderData?.title,
					description: ctx.loaderData?.description,
				}),
				noindex: library.visible === false,
			}),
		};
	},
});

function Docs() {
	const { content, filePath, title } = Route.useLoaderData();
	const versionMatch = useMatch({ from: '/_library/$libraryId/$version' });
	const config = versionMatch.loaderData?.config;
	const { version, libraryId, framework } = Route.useParams();
	const library = getLibrary(libraryId);
	const branch = getBranch(library, version);
	const location = useLocation();

	return (
		<DocContainer>
			<Doc
				key={filePath}
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
				framework={framework}
			/>
		</DocContainer>
	);
}
