import { createFileRoute } from '@octanejs/tanstack-router';
import { seo } from '~/utils/seo';
import { type Framework, getLibrary } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { capitalize } from '~/utils/utils';
import { DocContainer } from '~/components/DocContainer.tsrx';
import { DocTitle } from '~/components/DocTitle.tsrx';
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

	return <DocContainer>
		<div
			class={twMerge('w-full flex bg-white/70 dark:bg-black/40 mx-auto rounded-xl max-w-[936px]')}
		>
			<div class={twMerge('flex overflow-auto flex-col w-full p-4 lg:p-6')}>
				<DocTitle>
					TanStack
					{frameworkOption?.label ?? capitalize(framework)}
					{' '}
					{library.name.replace('TanStack ', '')}
					Documentation
				</DocTitle>
				<div class="h-4" />
				<div class="h-px bg-gray-500 opacity-20" />
				<div class="h-4" />
				<div
					class={twMerge(
						'prose prose-gray prose-sm prose-p:leading-7 dark:prose-invert max-w-none',
						'styled-markdown-content',
					)}
				>
					Use the menu to select a documentation page.
				</div>
				<div class="h-24" />
			</div>
		</div>
	</DocContainer>;
}
