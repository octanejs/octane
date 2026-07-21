import { useQuery } from '@octanejs/tanstack-query';
import { Hydrate } from '@octanejs/tanstack-start';
import { visible } from '@octanejs/tanstack-start/hydration';
import { ArrowRight } from '@octanejs/lucide';
import { getSponsorsForSponsorPack } from '~/utils/sponsors.functions';
import { Button } from '~/ui';
import PlaceholderSponsorPack from './PlaceholderSponsorPack.tsrx';
import SponsorPack from './SponsorPack.tsrx';

type SponsorSectionProps = {
	title?: any;
	aspectRatio?: string;
	packMaxWidth?: string | number;
	showCTA?: boolean;
};

function SponsorPackWithQuery() {
	const { data: sponsors } = useQuery({
		queryKey: ['sponsors'],
		queryFn: () => getSponsorsForSponsorPack(),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	if (!sponsors) {
		return <PlaceholderSponsorPack />;
	}

	return <SponsorPack sponsors={sponsors} />;
}

export function SponsorSection({
	title = 'Sponsors',
	aspectRatio = '1/1',
	packMaxWidth,
	showCTA = true,
}: SponsorSectionProps) {
	return <div class="px-4 w-full lg:max-w-(--breakpoint-lg) md:mx-auto">
		<div class="space-y-8">
			<h3 class="text-3xl font-bold">{title}</h3>
			<div
				class="relative mx-auto flex w-full flex-wrap overflow-hidden [&>div]:h-full [&>div]:w-full"
				style={{ aspectRatio, maxWidth: packMaxWidth }}
			>
				<Hydrate when={visible({ rootMargin: '50%' })} fallback={<PlaceholderSponsorPack />}>
					<SponsorPackWithQuery />
				</Hydrate>
			</div>
			{showCTA
				? <div class="flex justify-center">
						<Button as="a" href="https://github.com/sponsors/tannerlinsley">
							Become a Sponsor
							<ArrowRight className="w-4 h-4" />
						</Button>
					</div>
				: null}
		</div>
	</div>;
}
