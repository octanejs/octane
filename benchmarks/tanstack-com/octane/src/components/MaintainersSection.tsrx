import { Link } from '@octanejs/tanstack-router';
import { type LibraryId } from '~/libraries';
import { getLibraryMaintainers } from '~/libraries/maintainers';
import { Button } from '~/ui';
import { CompactMaintainerCard } from './MaintainerCard.tsrx';

type MaintainersSectionProps = {
	libraryId: LibraryId;
};

export function MaintainersSection({ libraryId }: MaintainersSectionProps) {
	const maintainers = getLibraryMaintainers(libraryId);

	if (!maintainers.length) {
		return null;
	}

	return <div class="px-4 w-full lg:max-w-(--breakpoint-lg) mx-auto">
		<div class="space-y-8">
			<h3 class="text-3xl font-bold">Maintainers</h3>
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">{maintainers.map(
				(maintainer) => <CompactMaintainerCard key={maintainer.github} maintainer={maintainer} />,
			)}</div>
			<div class="flex justify-center">
				<Button
					as={Link}
					to="/$libraryId/$version/docs/contributors"
					params={{ libraryId, version: 'latest' } as never}
				>
					View All Maintainers
				</Button>
			</div>
		</div>
	</div>;
}
