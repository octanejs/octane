import { getLibrary, type LibraryId } from '~/libraries';
import { HeartHandshake } from '@octanejs/lucide';
import { Card } from './Card.tsrx';
import { trackEvent } from '~/utils/analytics';

interface PartnershipCalloutProps {
	libraryId: LibraryId;
}

export function PartnershipCallout({ libraryId }: PartnershipCalloutProps) {
	const library = getLibrary(libraryId);

	return <Card
		className="relative flex-1 flex flex-col items-center text-sm text-center
                    divide-y-2 divide-gray-500/10 overflow-hidden
                    w-[500px] max-w-full mx-auto"
	>
		<span class="flex items-center gap-2 p-8 text-3xl text-rose-500 font-black uppercase">
			{library.name.replace('TanStack ', '') as string}

			<HeartHandshake />
			You?
		</span>
		<div class="flex flex-col p-4 gap-3 text-sm">
			<div>
				We're looking for
				{library.name as string}
				Partners to join our mission! Partner with us to push the boundaries of
				{library.name as string}
				and build amazing things together.
			</div>
			<a
				href={`mailto:partners@tanstack.com?subject=TanStack ${library.name} Partnership`}
				class="text-blue-500 uppercase font-black text-sm"
				onClick={() => {
					trackEvent('partner_inquiry_started', {
						placement: 'library_callout',
					});
				}}
			>
				Let's chat
			</a>
		</div>
	</Card>;
}
