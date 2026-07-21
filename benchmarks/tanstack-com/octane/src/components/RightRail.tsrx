import { Link } from '@octanejs/tanstack-router';
import { twMerge } from 'tailwind-merge';
import {
	PartnerImage,
	partnerTierFlares,
	partnerTierLabels,
	type Partner,
	type PartnerTier,
} from '~/utils/partners.tsrx';
import {
	getPartnerPlacementAnalyticsMetadata,
	getPartnerTierGroupsForPlacement,
	type PartnerPlacementContext,
} from '~/utils/partner-placement';
import { usePartnerPlacementContext } from '~/utils/usePartnerPlacementContext';
import { trackEvent, useTrackedImpression, type PartnerPlacement } from '~/utils/analytics';

type RailPartner = {
	category: Partner['category'];
	id: string;
	name: string;
	href: string;
	score: number;
	tier?: PartnerTier;
	image: Parameters<typeof PartnerImage>[0]['config'];
};

type RightRailProps = {
	children: any;
	className?: string;
	breakpoint?: 'sm' | 'md';
	stickyOffset?: 'navbar' | 'docs-tabs';
};

export function RightRail({
	children,
	className,
	breakpoint = 'sm',
	stickyOffset = 'navbar',
}: RightRailProps) {
	const stickyTopClass =
		stickyOffset === 'docs-tabs'
			? breakpoint === 'md'
				? 'md:top-[calc(var(--navbar-height)+var(--docs-tabs-height,0px))]'
				: 'sm:top-[calc(var(--navbar-height)+var(--docs-tabs-height,0px))]'
			: breakpoint === 'md'
				? 'md:top-[var(--navbar-height)]'
				: 'sm:top-[var(--navbar-height)]';
	const stickyMaxHeightClass =
		stickyOffset === 'docs-tabs'
			? breakpoint === 'md'
				? 'md:max-h-[calc(100dvh-var(--navbar-height)-var(--docs-tabs-height,0px))]'
				: 'sm:max-h-[calc(100dvh-var(--navbar-height)-var(--docs-tabs-height,0px))]'
			: breakpoint === 'md'
				? 'md:max-h-[calc(100dvh-var(--navbar-height))]'
				: 'sm:max-h-[calc(100dvh-var(--navbar-height))]';
	const wrapperBreakpointClass =
		breakpoint === 'md'
			? 'w-full md:w-[300px] shrink-0 md:sticky hidden md:block'
			: 'w-full sm:w-[300px] shrink-0 sm:sticky hidden sm:block';

	const innerBreakpointClass =
		breakpoint === 'md' ? 'md:sticky' : 'sm:sticky';

	return <div class={twMerge(wrapperBreakpointClass, stickyTopClass, className)}>
		<div
			class={twMerge(
				innerBreakpointClass,
				stickyTopClass,
				stickyMaxHeightClass,
				'ml-auto flex flex-col gap-4 pb-4 max-w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0',
			)}
		>{children}</div>
	</div>;
}

const railTierLayout: Record<
	PartnerTier,
	{
		flexBasis: string;
		minHeight: string;
		logoMaxWidth: string;
		logoMaxHeight: string;
		padding: string;
	}
> = {
	gold: {
		flexBasis: 'basis-full',
		minHeight: 'min-h-[72px]',
		logoMaxWidth: 'max-w-[180px]',
		logoMaxHeight: 'max-h-[40px]',
		padding: 'px-4 py-3',
	},
	silver: {
		flexBasis: 'basis-1/2',
		minHeight: 'min-h-[60px]',
		logoMaxWidth: 'max-w-[100px]',
		logoMaxHeight: 'max-h-[26px]',
		padding: 'px-2.5 py-2.5',
	},
	bronze: {
		flexBasis: 'basis-1/3',
		minHeight: 'min-h-[56px]',
		logoMaxWidth: 'max-w-[70px]',
		logoMaxHeight: 'max-h-[22px]',
		padding: 'px-2 py-2',
	},
};

export function PartnersRail({
	analyticsPlacement,
	partners,
	title = 'Partners',
	titleTo = '/partners',
}: {
	analyticsPlacement: PartnerPlacement;
	partners: Array<RailPartner>;
	title?: string;
	titleTo?: '/partners';
}) {
	const placementContext = usePartnerPlacementContext({
		orderStrategy: 'tier-rotated',
		surface: analyticsPlacement,
	});

	const rowsByTier = getPartnerTierGroupsForPlacement(partners, placementContext);

	let slotIndex = 0;

	return <div
		class="group/rail flex flex-col border-l border-gray-500/20 rounded-bl-lg overflow-hidden w-full"
	>
		<div
			class="w-full flex gap-2 justify-between items-center border-b border-gray-500/20 px-3 py-2"
		>
			<Link
				className="font-medium opacity-60 hover:opacity-100 text-xs"
				to={titleTo}
			>{title as string}</Link>
			<a
				href="https://docs.google.com/document/d/1Hg2MzY2TU6U3hFEZ3MLe2oEOM3JS4-eByti3kdJU3I8"
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium opacity-60 hover:opacity-100 text-xs hover:underline"
				onClick={() => {
					trackEvent('partner_inquiry_started', {
						placement: analyticsPlacement,
					});
				}}
			>
				Become a Partner
			</a>
		</div>
		{rowsByTier.map((row) => {
			const flare = partnerTierFlares[row.tier];
			return <div key={row.tier} class="relative flex flex-wrap items-stretch w-full">
				{/* Tier-colored top line */}
				<div class={`absolute top-0 left-0 right-0 h-1 bg-linear-to-r ${flare.gradientStops}`} />
				{/* Absolute top-left tier label */}
				<div
					class={`absolute top-0.5 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-px rounded-full bg-white dark:bg-gray-900 z-10 ${flare.labelColor} text-[8px] uppercase tracking-[0.14em] font-semibold`}
				>
					<span class={flare.iconColor}>{flare.icon}</span>
					<span>{partnerTierLabels[row.tier] as string}</span>
				</div>
				{row.partners.map((partner) => {
					const index = slotIndex++;
					return <PartnersRailItem
						key={partner.id}
						analyticsPlacement={analyticsPlacement}
						index={index}
						placementContext={placementContext}
						partner={partner}
					/>;
				})}
			</div>;
		})}
	</div>;
}

function PartnersRailItem({
	analyticsPlacement,
	index,
	placementContext,
	partner,
}: {
	analyticsPlacement: PartnerPlacement;
	index: number;
	placementContext: PartnerPlacementContext;
	partner: RailPartner;
}) {
	const layout = railTierLayout[partner.tier ?? 'bronze'];
	const analyticsMetadata = getPartnerPlacementAnalyticsMetadata(partner, placementContext);
	const ref = useTrackedImpression<'partner_viewed', HTMLAnchorElement>({
		event: 'partner_viewed',
		props: {
			partner_id: partner.id,
			placement: analyticsPlacement,
			...analyticsMetadata,
			slot_index: index,
		},
	});

	return <a
		ref={ref}
		href={partner.href}
		target="_blank"
		rel="noreferrer"
		class={twMerge(
			'flex items-center justify-center overflow-hidden border-r border-b border-gray-500/20 hover:bg-gray-500/10 transition-colors duration-150 ease-out',
			layout.flexBasis,
			layout.minHeight,
			layout.padding,
		)}
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
		<div
			class={twMerge(
				'w-full flex items-center justify-center mx-auto grayscale brightness-90 group-hover/rail:grayscale-0 group-hover/rail:brightness-100 transition-[filter] duration-500 ease-out',
				layout.logoMaxWidth,
			)}
		>
			<PartnerImage
				className={twMerge('w-full object-contain', layout.logoMaxHeight)}
				config={partner.image}
				alt={partner.name}
			/>
		</div>
	</a>;
}
