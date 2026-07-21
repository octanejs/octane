import { createFileRoute } from '@octanejs/tanstack-router';
import { twMerge } from 'tailwind-merge';
import { DocContainer } from '~/components/DocContainer.tsrx';
import { DocTitle } from '~/components/DocTitle.tsrx';
import { getLibrary } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { FrameworkCard } from '~/components/FrameworkCard.tsrx';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';
import { DiscordIcon } from '~/components/icons/DiscordIcon.tsrx';
import { Card } from '~/components/Card.tsrx';
import { getFrameworkPackageName } from '~/libraries/frameworkSupport';

export const Route = createFileRoute('/_library/$libraryId/$version/docs/framework/')({
	component: RouteComponent,
});

function RouteComponent() {
	const { libraryId, version } = Route.useParams();
	const library = getLibrary(libraryId);

	const frameworks = getFrameworkOptions(library.frameworks);

	return <DocContainer>
		<div
			class={twMerge('w-full flex bg-white/70 dark:bg-black/40 mx-auto rounded-xl max-w-[936px]')}
		>
			<div class={twMerge('flex overflow-auto flex-col w-full p-4 lg:p-6')}>
				<DocTitle>Supported {library.name} Frameworks</DocTitle>
				<div class="h-4" />
				<div class="h-px bg-gray-500 opacity-20" />
				<div class="h-6" />

				{/* Framework Cards Grid */}
				<div
					class={twMerge('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4')}
				>{frameworks.map((framework, i) => {
					const packageName = getFrameworkPackageName(framework.value, libraryId, library);
					return <FrameworkCard
						key={framework.value}
						framework={framework}
						libraryId={libraryId}
						version={version}
						packageName={packageName}
						index={i}
						library={library}
					/>;
				})}</div>

				{/* Call to Action Message */}
				<Card className="mt-12 p-6 md:p-8">
					<div class="text-center max-w-2xl mx-auto">
						<h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
							Want to add support for another framework?
						</h3>
						<p class="text-gray-600 dark:text-gray-400 mb-6">
							We'd love to help you create a framework adapter for
							{library.name}
							. Join our community to discuss implementation details and get support.
						</p>
						<div class="flex flex-wrap justify-center gap-4">
							<a
								href="https://tlinz.com/discord"
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
							>
								<DiscordIcon className="w-5 h-5" />
								Join Discord
							</a>
							<a
								href={`https://github.com/${library.repo}/discussions`}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
							>
								<GithubIcon className="w-5 h-5" />
								Start Discussion
							</a>
						</div>
					</div>
				</Card>

				<div class="h-24" />
			</div>
		</div>
	</DocContainer>;
}
