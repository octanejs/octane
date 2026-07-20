import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hydrate } from '@tanstack/react-start';
import { visible } from '@tanstack/react-start/hydration';
import { ArrowRight } from 'lucide-react';
import { getSponsorsForSponsorPack } from '~/utils/sponsors.functions';
import { Button } from '~/ui';
import PlaceholderSponsorPack from './PlaceholderSponsorPack';
import SponsorPack from './SponsorPack';

type SponsorSectionProps = {
	title?: ReactNode;
	aspectRatio?: string;
	packMaxWidth?: CSSProperties['maxWidth'];
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
	return (
		<div className="px-4 w-full lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div className="space-y-8">
				<h3 className="text-3xl font-bold">{title}</h3>
				<div
					className="relative mx-auto flex w-full flex-wrap overflow-hidden [&>div]:h-full [&>div]:w-full"
					style={{ aspectRatio, maxWidth: packMaxWidth }}
				>
					<Hydrate when={visible({ rootMargin: '50%' })} fallback={<PlaceholderSponsorPack />}>
						<SponsorPackWithQuery />
					</Hydrate>
				</div>
				{showCTA ? (
					<div className="flex justify-center">
						<Button as="a" href="https://github.com/sponsors/tannerlinsley">
							Become a Sponsor
							<ArrowRight className="w-4 h-4" />
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}
