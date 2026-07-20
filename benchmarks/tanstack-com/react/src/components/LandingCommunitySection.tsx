import { Hydrate } from '@tanstack/react-start';
import { visible } from '@tanstack/react-start/hydration';
import type { LibraryId } from '~/libraries';
import { MaintainersSection } from './MaintainersSection';
import { PartnersSection } from './PartnersSection';

interface LandingCommunitySectionProps {
	libraryId: LibraryId;
}

function SectionSkeleton({ title }: { title: string }) {
	return (
		<div className="px-4 w-full lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div className="space-y-8">
				<div className="h-10 w-48 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
					{Array.from({ length: 4 }).map((_, index) => (
						<div
							key={`${title}-${index}`}
							className="aspect-square rounded-lg bg-gray-200/70 dark:bg-gray-800/70 animate-pulse"
						/>
					))}
				</div>
			</div>
		</div>
	);
}

export function LandingCommunitySection({ libraryId }: LandingCommunitySectionProps) {
	return (
		<Hydrate
			when={visible({ rootMargin: '25%' })}
			fallback={
				<div className="flex flex-col gap-20 md:gap-24">
					<SectionSkeleton title="Maintainers" />
					<SectionSkeleton title="Partners" />
				</div>
			}
		>
			<div className="flex flex-col gap-20 md:gap-24">
				<MaintainersSection libraryId={libraryId} />
				<PartnersSection libraryId={libraryId} />
			</div>
		</Hydrate>
	);
}
