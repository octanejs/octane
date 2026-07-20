import * as React from 'react';
import { getPartnersForPlacement } from '~/utils/partner-placement';
import { partners, type Partner } from '~/utils/partners';
import { usePartnerPlacementContext } from '~/utils/usePartnerPlacementContext';

export type DeploymentProviderId = 'cloudflare' | 'netlify' | 'railway';

export const deploymentProviderIds: ReadonlyArray<DeploymentProviderId> = [
	'cloudflare',
	'netlify',
	'railway',
];

type DeploymentProviderPlacementPartner = Pick<
	Partner,
	'category' | 'id' | 'name' | 'score' | 'tier'
> & {
	provider: DeploymentProviderId;
};

function getDeploymentProviderPartner(provider: DeploymentProviderId) {
	return partners.find(
		(partner) =>
			partner.id === provider && partner.category === 'deployment' && partner.status === 'active',
	);
}

function getDeploymentProviderPlacementPartner(
	provider: DeploymentProviderId,
): DeploymentProviderPlacementPartner | undefined {
	const partner = getDeploymentProviderPartner(provider);

	if (!partner) {
		return undefined;
	}

	return {
		category: partner.category,
		id: partner.id,
		name: partner.name,
		provider,
		score: partner.score,
		tier: partner.tier,
	};
}

export function useDeploymentProviderPlacement({
	availableProviders,
	surface,
}: {
	availableProviders: ReadonlyArray<DeploymentProviderId>;
	surface: string;
}) {
	const placementContext = usePartnerPlacementContext({
		category: 'deployment',
		orderStrategy: 'tier-rotated',
		surface,
	});

	return React.useMemo(() => {
		const availableProviderSet = new Set(availableProviders);
		const placementPartners = deploymentProviderIds.flatMap((provider) => {
			if (!availableProviderSet.has(provider)) {
				return [];
			}

			const partner = getDeploymentProviderPlacementPartner(provider);

			return partner ? [partner] : [];
		});

		return getPartnersForPlacement(placementPartners, placementContext).map(
			(partner) => partner.provider,
		);
	}, [availableProviders, placementContext]);
}
