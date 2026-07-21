import * as React from 'octane';
import { useLoaderData } from '@octanejs/tanstack-router';
import type { Partner } from '~/utils/partners.tsrx';
import {
	getPartnerPlacementContext,
	getPartnerViewPlacementSeed,
	type PartnerPlacementContext,
	type PartnerPlacementOrderStrategy,
} from '~/utils/partner-placement';

export function usePartnerPlacementContext({
	category,
	orderStrategy,
	surface,
}: {
	category?: Partner['category'];
	orderStrategy: PartnerPlacementOrderStrategy;
	surface: string;
}): PartnerPlacementContext {
	const { partnerPlacementSessionSeed } = useLoaderData({ from: '__root__' });
	const rotationSeed =
		orderStrategy === 'tier-rotated'
			? getPartnerViewPlacementSeed(surface, partnerPlacementSessionSeed)
			: undefined;

	return React.useMemo(
		() =>
			getPartnerPlacementContext({
				category,
				orderStrategy,
				seed: rotationSeed,
				surface,
			}),
		[category, orderStrategy, rotationSeed, surface],
	);
}
