import { Link } from '@octanejs/tanstack-router';
import { PartnersGrid } from './PartnersGrid.tsrx';
import { PartnershipCallout } from './PartnershipCallout.tsrx';
import { type LibraryId } from '~/libraries';
import { Button } from '~/ui';

type PartnersSectionProps = {
	libraryId?: LibraryId;
	title?: string;
	showPreviousLink?: boolean;
};

export function PartnersSection({
	libraryId,
	title = 'Partners',
	showPreviousLink = true,
}: PartnersSectionProps) {
	if (!libraryId) {
		throw new Error('Library ID is required');
	}

	return <div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto mx-auto max-w-full">
		<div class="space-y-8">
			<h3 class="text-3xl font-bold">{title}</h3>
			<PartnersGrid analyticsPlacement="library_grid" />
			<PartnershipCallout libraryId={libraryId} />
			{showPreviousLink
				? <div class="flex justify-center mt-6">
						<Button
							as={Link}
							to="/partners"
							search={(libraryId
								? { libraries: [libraryId], status: 'inactive' }
								: { status: 'inactive' }) as any}
						>
							View Previous Partners
						</Button>
					</div>
				: null}
		</div>
	</div>;
}
