import { Hydrate } from '@octanejs/tanstack-start';
import { visible } from '@octanejs/tanstack-start/hydration';
import type { LibraryId } from '~/libraries';
import { MaintainersSection } from './MaintainersSection.tsrx';
import { PartnersSection } from './PartnersSection.tsrx';

interface LandingCommunitySectionProps {
	libraryId: LibraryId;
}

function SectionSkeleton({ title }: { title: string }) {
	return <div class="px-4 w-full lg:max-w-(--breakpoint-lg) md:mx-auto">
		<div class="space-y-8">
			<div class="h-10 w-48 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">{Array.from({
				length: 4,
			}).map(
				(_, index) =>
					<div
						key={`${title}-${index}`}
						class="aspect-square rounded-lg bg-gray-200/70 dark:bg-gray-800/70 animate-pulse"
					/>,
			)}</div>
		</div>
	</div>;
}

export function LandingCommunitySection({ libraryId }: LandingCommunitySectionProps) {
	return <Hydrate
		when={visible({ rootMargin: '25%' })}
		fallback={<div class="flex flex-col gap-20 md:gap-24">
			<SectionSkeleton title="Maintainers" />
			<SectionSkeleton title="Partners" />
		</div>}
	>
		<div class="flex flex-col gap-20 md:gap-24">
			<MaintainersSection libraryId={libraryId} />
			<PartnersSection libraryId={libraryId} />
		</div>
	</Hydrate>;
}
