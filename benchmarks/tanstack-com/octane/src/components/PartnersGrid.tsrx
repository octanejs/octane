import {
	partners as allPartners,
	PartnerImage,
	partnerTierFlares,
	partnerTierLabels,
	type PartnerTier,
} from '~/utils/partners.tsrx';
import {
	getPartnerPlacementAnalyticsMetadata,
	getPartnerTierGroupsForPlacement,
	type PartnerPlacementContext,
} from '~/utils/partner-placement';
import { usePartnerPlacementContext } from '~/utils/usePartnerPlacementContext';
import { Card } from '~/components/Card.tsrx';
import { trackEvent, useTrackedImpression, type PartnerPlacement } from '~/utils/analytics';

type PartnerItem = (typeof allPartners)[number];

type PartnersGridProps = {
	analyticsPlacement?: PartnerPlacement;
	partnersList?: PartnerItem[];
};

const tierLayout: Record<PartnerTier, {
	flexBasis: string;
	minHeight: string;
	logoMaxWidth: string;
	logoMaxHeight: string;
	padding: string;
}> = {
	gold: {
		flexBasis: 'basis-full sm:basis-1/2',
		minHeight: 'min-h-[220px]',
		logoMaxWidth: 'max-w-[400px]',
		logoMaxHeight: 'max-h-[120px]',
		padding: 'p-12',
	},
	silver: {
		flexBasis: 'basis-full sm:basis-1/3 lg:basis-1/4',
		minHeight: 'min-h-[130px]',
		logoMaxWidth: 'max-w-[180px]',
		logoMaxHeight: 'max-h-[56px]',
		padding: 'p-6',
	},
	bronze: {
		flexBasis: 'basis-1/2 sm:basis-1/4 lg:basis-1/5 xl:basis-1/6',
		minHeight: 'min-h-[100px]',
		logoMaxWidth: 'max-w-[110px]',
		logoMaxHeight: 'max-h-[36px]',
		padding: 'p-4',
	},
};

function PartnerGridItem({
	analyticsPlacement,
	index,
	placementContext,
	partner,
}: {
	analyticsPlacement: PartnerPlacement;
	index: number;
	placementContext: PartnerPlacementContext;
	partner: PartnerItem;
}) {
	const analyticsMetadata = getPartnerPlacementAnalyticsMetadata(partner, placementContext);
	const ref = useTrackedImpression<'partner_viewed', HTMLAnchorElement>({
		event: 'partner_viewed',
		props: {
			partner_id: partner.id,
			...analyticsMetadata,
			placement: analyticsPlacement,
			slot_index: index,
		},
	});

	const layout = tierLayout[partner.tier ?? 'bronze'];

	return <a
		ref={ref}
		href={partner.href}
		target="_blank"
		rel="noreferrer"
		class={`flex items-center justify-center
        border-r border-b border-gray-200 dark:border-gray-800
        hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors duration-150 ease-out
        ${layout.flexBasis} ${layout.minHeight} ${layout.padding}`}
		onClick={() => {
			let destinationHost: string | undefined;
			try {
				destinationHost = new URL(partner.href).host;
			} catch {
			}
			trackEvent('partner_clicked', {
				partner_id: partner.id,
				placement: analyticsPlacement,
				destination: 'external',
				destination_host: destinationHost,
				...analyticsMetadata,
				slot_index: index,
			});
		}}
	>
		<div class={`w-full flex items-center justify-center ${layout.logoMaxWidth}`}>
			<PartnerImage
				className={`w-full object-contain ${layout.logoMaxHeight}`}
				config={partner.image}
				alt={partner.name}
			/>
		</div>
	</a>;
}

export function PartnersGrid({ analyticsPlacement = 'grid', partnersList }: PartnersGridProps) {
	const items = (partnersList ?? allPartners).filter((partner) => partner.status === 'active');

	const placementContext = usePartnerPlacementContext({
		orderStrategy: 'tier-rotated',
		surface: analyticsPlacement,
	});

	const tiersWithPartners = getPartnerTierGroupsForPlacement(items, placementContext);

	let slotIndex = 0;

	return <div class="flex flex-col gap-3">{tiersWithPartners.map((row) => {
		const flare = partnerTierFlares[row.tier];
		return <Card
			key={row.tier}
			className={`overflow-hidden rounded-none rounded-l-sm rounded-r-2xl bg-linear-to-b ${flare.gradientStops}`}
		>
			<div class="ml-1.5 bg-white dark:bg-gray-900">
				<div
					class="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2"
				>
					<span class={flare.iconColor}>{flare.icon}</span>
					<span class={`text-[10px] uppercase tracking-[0.18em] font-semibold ${flare.labelColor}`}>
						{partnerTierLabels[row.tier] as string}
					</span>
				</div>
				<div class="flex flex-wrap items-stretch -mr-px -mb-px">{row.partners.map((partner) => {
					const index = slotIndex++;
					return <PartnerGridItem
						key={partner.id}
						analyticsPlacement={analyticsPlacement}
						index={index}
						placementContext={placementContext}
						partner={partner}
					/>;
				})}</div>
			</div>
		</Card>;
	})}</div>;
}
