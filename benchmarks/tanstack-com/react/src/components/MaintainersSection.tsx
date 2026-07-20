import { Link } from '@tanstack/react-router';
import { LibraryId } from '~/libraries';
import { getLibraryMaintainers } from '~/libraries/maintainers';
import { Button } from '~/ui';
import { CompactMaintainerCard } from './MaintainerCard';

type MaintainersSectionProps = {
	libraryId: LibraryId;
};

export function MaintainersSection({ libraryId }: MaintainersSectionProps) {
	const maintainers = getLibraryMaintainers(libraryId);

	if (!maintainers.length) {
		return null;
	}

	return (
		<div className="px-4 w-full lg:max-w-(--breakpoint-lg) mx-auto">
			<div className="space-y-8">
				<h3 className="text-3xl font-bold">Maintainers</h3>
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
					{maintainers.map((maintainer) => (
						<CompactMaintainerCard key={maintainer.github} maintainer={maintainer} />
					))}
				</div>
				<div className="flex justify-center">
					<Button
						as={Link}
						to="/$libraryId/$version/docs/contributors"
						params={{ libraryId, version: 'latest' } as never}
					>
						View All Maintainers
					</Button>
				</div>
			</div>
		</div>
	);
}
