import { createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
import { Framework, getLibrary } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { capitalize } from '~/utils/utils';
import { DocContainer } from '~/components/DocContainer';
import { DocTitle } from '~/components/DocTitle';
import { twMerge } from 'tailwind-merge';

export const Route = createFileRoute('/_library/$libraryId/$version/docs/framework/$framework/')({
	staleTime: 1000 * 60 * 5,
	loader: (ctx) => {
		const { framework } = ctx.params;

		const [frameworkOption] = getFrameworkOptions([framework as Framework]);

		return {
			title: frameworkOption?.label ?? capitalize(framework),
		};
	},
	head: (ctx) => {
		const library = getLibrary(ctx.params.libraryId);
		const tail = `${library.name} ${capitalize(ctx.params.framework)} Docs`;

		return {
			meta: seo({
				title: ctx.loaderData?.title ? `${ctx.loaderData.title} | ${tail}` : tail,
				noindex: library.visible === false,
			}),
		};
	},
	component: Comp,
});

function Comp() {
	const { framework, libraryId } = Route.useParams();
	const library = getLibrary(libraryId);
	const [frameworkOption] = getFrameworkOptions([framework as Framework]);

	return (
		<DocContainer>
			<div
				className={twMerge(
					'w-full flex bg-white/70 dark:bg-black/40 mx-auto rounded-xl max-w-[936px]',
				)}
			>
				<div className={twMerge('flex overflow-auto flex-col w-full p-4 lg:p-6')}>
					<DocTitle>
						TanStack {frameworkOption?.label ?? capitalize(framework)}{' '}
						{library.name.replace('TanStack ', '')} Documentation
					</DocTitle>
					<div className="h-4" />
					<div className="h-px bg-gray-500 opacity-20" />
					<div className="h-4" />
					<div
						className={twMerge(
							'prose prose-gray prose-sm prose-p:leading-7 dark:prose-invert max-w-none',
							'styled-markdown-content',
						)}
					>
						Use the menu to select a documentation page.
					</div>
					<div className="h-24" />
				</div>
			</div>
		</DocContainer>
	);
}
