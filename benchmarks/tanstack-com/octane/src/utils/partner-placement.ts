import type { Partner, PartnerTier } from '~/utils/partners.tsrx';

export const partnerPlacementOrderStrategies = [
	'static-curated',
	'tier-rotated',
	'contextual-recommendation',
	'machine-readable',
] as const;

export type PartnerPlacementOrderStrategy = (typeof partnerPlacementOrderStrategies)[number];

export type PartnerPlacementContext = {
	category?: Partner['category'];
	orderStrategy: PartnerPlacementOrderStrategy;
	rotationSeed?: string;
};

export type PartnerPlacementAnalyticsMetadata = {
	order_strategy: PartnerPlacementOrderStrategy;
	partner_tier: PartnerTier;
	rotation_seed?: string;
};

type PartnerForPlacement = Pick<Partner, 'category' | 'id' | 'name' | 'score' | 'tier'> & {
	placementWeight?: number;
};

const partnerPlacementTiers = [
	'gold',
	'silver',
	'bronze',
] as const satisfies ReadonlyArray<PartnerTier>;

const partnerTierPlacementOrder = {
	gold: 0,
	silver: 1,
	bronze: 2,
} satisfies Record<PartnerTier, number>;

const reservedPartnerPlacementRules = [
	{
		category: 'deployment',
		partnerId: 'cloudflare',
		placementRank: 0,
	},
] satisfies ReadonlyArray<{
	category: Partner['category'];
	partnerId: string;
	placementRank: number;
}>;

function getPartnerTier(partner: Pick<Partner, 'tier'>): PartnerTier {
	return partner.tier ?? 'bronze';
}

export function createPartnerPlacementSessionSeed() {
	// Bench delta: a fixed seed makes partner rotation reproducible so the
	// correctness gate can compare flavors byte-for-byte.
	if (typeof process !== 'undefined' && process.env?.BENCH_PARTNER_SEED) {
		return process.env.BENCH_PARTNER_SEED;
	}

	const crypto = globalThis.crypto;

	if (crypto?.randomUUID) {
		return crypto.randomUUID();
	}

	if (crypto?.getRandomValues) {
		const values = new Uint32Array(4);
		crypto.getRandomValues(values);
		return Array.from(values, (value) => value.toString(36)).join('');
	}

	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function getPartnerViewPlacementSeed(surface: string, sessionSeed: string) {
	return `${surface}:${sessionSeed}`;
}

export function getPartnerPlacementContext({
	category,
	orderStrategy,
	seed,
	surface,
}: {
	category?: Partner['category'];
	orderStrategy: PartnerPlacementOrderStrategy;
	seed?: string;
	surface: string;
}): PartnerPlacementContext {
	return {
		category,
		orderStrategy,
		rotationSeed: orderStrategy === 'tier-rotated' ? (seed ?? surface) : undefined,
	};
}

function hashString(value: string) {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
}

function comparePartnerIdentity(
	left: Pick<Partner, 'id' | 'name'>,
	right: Pick<Partner, 'id' | 'name'>,
) {
	const nameComparison = left.name.localeCompare(right.name);

	if (nameComparison !== 0) {
		return nameComparison;
	}

	return left.id.localeCompare(right.id);
}

function getReservedPartnerRank(partner: PartnerForPlacement, category: Partner['category']) {
	if (partner.category !== category) {
		return undefined;
	}

	const rule = reservedPartnerPlacementRules.find(
		(candidate) => candidate.category === category && candidate.partnerId === partner.id,
	);

	return rule?.placementRank;
}

function getReservedPlacementCategory<TPartner extends PartnerForPlacement>(
	left: TPartner,
	right: TPartner,
	context: PartnerPlacementContext,
) {
	if (context.category) {
		return context.category;
	}

	return left.category === right.category ? left.category : undefined;
}

function compareReservedPartnerPlacement<TPartner extends PartnerForPlacement>(
	left: TPartner,
	right: TPartner,
	context: PartnerPlacementContext,
) {
	const category = getReservedPlacementCategory(left, right, context);

	if (!category) {
		return 0;
	}

	const leftRank = getReservedPartnerRank(left, category);
	const rightRank = getReservedPartnerRank(right, category);

	if (leftRank !== undefined && rightRank !== undefined) {
		return leftRank - rightRank;
	}

	if (leftRank !== undefined) {
		return -1;
	}

	if (rightRank !== undefined) {
		return 1;
	}

	return 0;
}

function applyReservedPartnerPlacementRules<TPartner extends PartnerForPlacement>(
	partners: Array<TPartner>,
	context: PartnerPlacementContext,
) {
	let nextPartners = partners;

	for (const rule of reservedPartnerPlacementRules) {
		const shouldApplyRule =
			context.category === rule.category ||
			nextPartners.some(
				(partner) => partner.category === rule.category && partner.id !== rule.partnerId,
			);

		if (!shouldApplyRule) {
			continue;
		}

		const partnersBeforeReserved: Array<TPartner> = [];
		const categoryPartnersBeforeReserved: Array<TPartner> = [];
		const partnersAfterReserved: Array<TPartner> = [];
		let reservedPartner: TPartner | undefined;

		for (const partner of nextPartners) {
			if (partner.category === rule.category && partner.id === rule.partnerId) {
				reservedPartner = partner;
				continue;
			}

			if (reservedPartner) {
				partnersAfterReserved.push(partner);
				continue;
			}

			if (partner.category === rule.category) {
				categoryPartnersBeforeReserved.push(partner);
				continue;
			}

			partnersBeforeReserved.push(partner);
		}

		if (!reservedPartner || categoryPartnersBeforeReserved.length === 0) {
			continue;
		}

		nextPartners = [
			...partnersBeforeReserved,
			reservedPartner,
			...categoryPartnersBeforeReserved,
			...partnersAfterReserved,
		];
	}

	return nextPartners;
}

function compareLegacyPartnerPriority<TPartner extends PartnerForPlacement>(
	left: TPartner,
	right: TPartner,
) {
	const scoreComparison = right.score - left.score;

	if (scoreComparison !== 0) {
		return scoreComparison;
	}

	return comparePartnerIdentity(left, right);
}

function compareSeededPartnerOrder<TPartner extends PartnerForPlacement>(
	left: TPartner,
	right: TPartner,
	seed: string,
) {
	const leftWeight =
		typeof left.placementWeight === 'number' && left.placementWeight > 0 ? left.placementWeight : 1;
	const rightWeight =
		typeof right.placementWeight === 'number' && right.placementWeight > 0
			? right.placementWeight
			: 1;
	const leftRandom = (hashString(`${seed}:${left.id}`) + 1) / 4294967297;
	const rightRandom = (hashString(`${seed}:${right.id}`) + 1) / 4294967297;
	const leftRank = -Math.log(leftRandom) / leftWeight;
	const rightRank = -Math.log(rightRandom) / rightWeight;
	const seededComparison = leftRank - rightRank;

	if (seededComparison !== 0) {
		return seededComparison;
	}

	return comparePartnerIdentity(left, right);
}

export function comparePartnersForPlacement<TPartner extends PartnerForPlacement>(
	left: TPartner,
	right: TPartner,
	context: PartnerPlacementContext,
) {
	const tierComparison =
		partnerTierPlacementOrder[getPartnerTier(left)] -
		partnerTierPlacementOrder[getPartnerTier(right)];

	if (tierComparison !== 0) {
		return tierComparison;
	}

	const reservedComparison = compareReservedPartnerPlacement(left, right, context);

	if (reservedComparison !== 0) {
		return reservedComparison;
	}

	if (context.orderStrategy === 'tier-rotated' && context.rotationSeed) {
		return compareSeededPartnerOrder(left, right, context.rotationSeed);
	}

	return compareLegacyPartnerPriority(left, right);
}

export function getPartnersForPlacement<TPartner extends PartnerForPlacement>(
	partners: Array<TPartner>,
	context: PartnerPlacementContext,
) {
	const sortedPartners = [...partners].sort((left, right) =>
		comparePartnersForPlacement(left, right, context),
	);

	return applyReservedPartnerPlacementRules(sortedPartners, context);
}

export function getPartnerTierGroupsForPlacement<TPartner extends PartnerForPlacement>(
	partners: Array<TPartner>,
	context: PartnerPlacementContext,
) {
	return partnerPlacementTiers
		.map((tier) => ({
			tier,
			partners: getPartnersForPlacement(
				partners.filter((partner) => getPartnerTier(partner) === tier),
				context,
			),
		}))
		.filter((group) => group.partners.length > 0);
}

export function getPartnerPlacementAnalyticsMetadata(
	partner: PartnerForPlacement,
	context: PartnerPlacementContext,
): PartnerPlacementAnalyticsMetadata {
	return {
		order_strategy: context.orderStrategy,
		partner_tier: getPartnerTier(partner),
		rotation_seed: context.rotationSeed,
	};
}
