// Ship upgrades granted by discovering partner/showcase islands

export type UpgradeType =
	| 'sailSpeed'
	| 'turnRate'
	| 'acceleration'
	| 'sideFireRate'
	| 'frontFireRate'
	| 'cannonRange'
	| 'fieldOfView'
	| 'dualCannons'
	| 'doubleShot'
	| 'gatlingGuns'
	| 'maxHealth'
	| 'healthRegen';

export interface Upgrade {
	type: UpgradeType;
	tier: number; // 1, 2, 3, etc.
	name: string;
	description: string;
	icon: string;
}

// All upgrade tiers - stackable upgrades have multiple tiers
export const UPGRADES: Upgrade[] = [
	// Sail Speed tiers (stackable: 1.25x each)
	{
		type: 'sailSpeed',
		tier: 1,
		name: 'Swift Sails I',
		description: 'Sail speed +25%',
		icon: '⚓',
	},
	{
		type: 'sailSpeed',
		tier: 2,
		name: 'Swift Sails II',
		description: 'Sail speed +25%',
		icon: '⚓',
	},
	{
		type: 'sailSpeed',
		tier: 3,
		name: 'Swift Sails III',
		description: 'Sail speed +25%',
		icon: '⚓',
	},

	// Turn Rate tiers (stackable: 1.2x each)
	{
		type: 'turnRate',
		tier: 1,
		name: 'Nimble Helm I',
		description: 'Turn rate +20%',
		icon: '↻',
	},
	{
		type: 'turnRate',
		tier: 2,
		name: 'Nimble Helm II',
		description: 'Turn rate +20%',
		icon: '↻',
	},

	// Acceleration (one-time unlock)
	{
		type: 'acceleration',
		tier: 1,
		name: 'Quick Launch',
		description: 'Reach max speed 50% faster',
		icon: '🚀',
	},

	// Side Cannon Fire Rate tiers (stackable: 0.67x each)
	{
		type: 'sideFireRate',
		tier: 1,
		name: 'Broadside I',
		description: 'Side cannon cooldown -33%',
		icon: '💨',
	},
	{
		type: 'sideFireRate',
		tier: 2,
		name: 'Broadside II',
		description: 'Side cannon cooldown -33%',
		icon: '💨',
	},
	{
		type: 'sideFireRate',
		tier: 3,
		name: 'Broadside III',
		description: 'Side cannon cooldown -33%',
		icon: '💨',
	},

	// Front Cannon Fire Rate tiers (stackable: 0.75x each)
	{
		type: 'frontFireRate',
		tier: 1,
		name: 'Rapid Fire I',
		description: 'Front cannon cooldown -25%',
		icon: '🔥',
	},
	{
		type: 'frontFireRate',
		tier: 2,
		name: 'Rapid Fire II',
		description: 'Front cannon cooldown -25%',
		icon: '🔥',
	},
	{
		type: 'frontFireRate',
		tier: 3,
		name: 'Rapid Fire III',
		description: 'Front cannon cooldown -25%',
		icon: '🔥',
	},

	// Cannon Range tiers (stackable: 1.25x each)
	{
		type: 'cannonRange',
		tier: 1,
		name: 'Long Range I',
		description: 'Cannon range +25%',
		icon: '🎯',
	},
	{
		type: 'cannonRange',
		tier: 2,
		name: 'Long Range II',
		description: 'Cannon range +25%',
		icon: '🎯',
	},
	{
		type: 'cannonRange',
		tier: 3,
		name: 'Long Range III',
		description: 'Cannon range +25%',
		icon: '🎯',
	},

	// Field of View tiers (stackable: increasing each tier)
	{
		type: 'fieldOfView',
		tier: 1,
		name: "Crow's Nest I",
		description: 'Field of view +15%',
		icon: '🔭',
	},
	{
		type: 'fieldOfView',
		tier: 2,
		name: "Crow's Nest II",
		description: 'Field of view +20%',
		icon: '🔭',
	},

	// Max Health tiers (stackable: +25 each)
	{
		type: 'maxHealth',
		tier: 1,
		name: 'Reinforced Hull I',
		description: 'Max health +25',
		icon: '🛡️',
	},
	{
		type: 'maxHealth',
		tier: 2,
		name: 'Reinforced Hull II',
		description: 'Max health +25',
		icon: '🛡️',
	},
	{
		type: 'maxHealth',
		tier: 3,
		name: 'Reinforced Hull III',
		description: 'Max health +25',
		icon: '🛡️',
	},

	// Health Regen tiers (stackable: 1.5x each)
	{
		type: 'healthRegen',
		tier: 1,
		name: 'Auto Repair I',
		description: 'Health regen +50%',
		icon: '❤️‍🩹',
	},
	{
		type: 'healthRegen',
		tier: 2,
		name: 'Auto Repair II',
		description: 'Health regen +50%',
		icon: '❤️‍🩹',
	},

	// One-time unlocks
	{
		type: 'dualCannons',
		tier: 1,
		name: 'Dual Cannons',
		description: 'Fire from both sides',
		icon: '⚔️',
	},
	{
		type: 'doubleShot',
		tier: 1,
		name: 'Double Shot',
		description: 'Two cannonballs per shot',
		icon: '💥',
	},
	{
		type: 'gatlingGuns',
		tier: 1,
		name: 'Gatling Guns',
		description: 'Hold SPACE for rapid fire',
		icon: '🔫',
	},
];

// Helper to find upgrade by type and tier
const findUpgrade = (type: UpgradeType, tier: number): Upgrade =>
	UPGRADES.find((u) => u.type === type && u.tier === tier)!;

// Partner upgrade order (15 partners)
// Varied pacing: speed-weighted early, combat-weighted late
export const PARTNER_UPGRADE_ORDER: Upgrade[] = [
	findUpgrade('sailSpeed', 1), // 1. Speed
	findUpgrade('sideFireRate', 1), // 2. Combat
	findUpgrade('fieldOfView', 1), // 3. Utility
	findUpgrade('turnRate', 1), // 4. Speed
	findUpgrade('maxHealth', 1), // 5. Defense
	findUpgrade('cannonRange', 1), // 6. Combat
	findUpgrade('sailSpeed', 2), // 7. Speed
	findUpgrade('dualCannons', 1), // 8. Combat unlock
	findUpgrade('healthRegen', 1), // 9. Defense
	findUpgrade('turnRate', 2), // 10. Speed
	findUpgrade('frontFireRate', 1), // 11. Combat
	findUpgrade('gatlingGuns', 1), // 12. Combat unlock
	findUpgrade('sideFireRate', 2), // 13. Combat
	findUpgrade('doubleShot', 1), // 14. Combat unlock
	findUpgrade('maxHealth', 2), // 15. Defense
];

// Showcase upgrade order (10 showcases)
// Late-game speed + combat depth
export const SHOWCASE_UPGRADE_ORDER: Upgrade[] = [
	findUpgrade('sailSpeed', 3), // 1. Speed
	findUpgrade('cannonRange', 2), // 2. Combat
	findUpgrade('acceleration', 1), // 3. Speed unlock
	findUpgrade('frontFireRate', 2), // 4. Combat
	findUpgrade('maxHealth', 3), // 5. Defense
	findUpgrade('sideFireRate', 3), // 6. Combat
	findUpgrade('healthRegen', 2), // 7. Defense
	findUpgrade('frontFireRate', 3), // 8. Combat
	findUpgrade('fieldOfView', 2), // 9. Utility
	findUpgrade('cannonRange', 3), // 10. Combat
];

// Combined order for easy indexing
export const UPGRADE_ORDER = [...PARTNER_UPGRADE_ORDER, ...SHOWCASE_UPGRADE_ORDER];

// Ship stats configuration
export interface ShipStats {
	sailSpeed: number; // Multiplier on max speed (default 1.0)
	turnRate: number; // Multiplier on turn speed (default 1.0)
	acceleration: number; // Multiplier on speed ramp (default 1.0)
	sideFireRate: number; // Side cannon cooldown in ms (lower = faster)
	frontFireRate: number; // Front cannon cooldown in ms (lower = faster)
	cannonRange: number; // Projectile speed multiplier
	dualCannons: boolean;
	doubleShot: boolean;
	gatlingGuns: boolean;
	fieldOfView: number; // Camera FOV multiplier
	maxHealth: number;
	healthRegen: number; // HP per second
}

export const BASE_SHIP_STATS: ShipStats = {
	sailSpeed: 1.0,
	turnRate: 1.0,
	acceleration: 1.0,
	sideFireRate: 2000,
	frontFireRate: 200,
	cannonRange: 0.7,
	dualCannons: false,
	doubleShot: false,
	gatlingGuns: false,
	fieldOfView: 1.0,
	maxHealth: 100,
	healthRegen: 0.5,
};

// Apply an upgrade to ship stats
export function applyUpgrade(stats: ShipStats, upgrade: Upgrade): ShipStats {
	const newStats = { ...stats };

	switch (upgrade.type) {
		case 'sailSpeed':
			newStats.sailSpeed = stats.sailSpeed * 1.25;
			break;
		case 'turnRate':
			newStats.turnRate = stats.turnRate * 1.2;
			break;
		case 'acceleration':
			newStats.acceleration = stats.acceleration * 1.5;
			break;
		case 'sideFireRate':
			newStats.sideFireRate = Math.max(500, stats.sideFireRate * 0.67);
			break;
		case 'frontFireRate':
			newStats.frontFireRate = Math.max(50, stats.frontFireRate * 0.75);
			break;
		case 'cannonRange':
			newStats.cannonRange = stats.cannonRange * 1.25;
			break;
		case 'fieldOfView':
			// Each tier is more powerful: 15%, 20%, 25%...
			const fovMultiplier = 1.15 + (upgrade.tier - 1) * 0.05;
			newStats.fieldOfView = stats.fieldOfView * fovMultiplier;
			break;
		case 'dualCannons':
			newStats.dualCannons = true;
			break;
		case 'doubleShot':
			newStats.doubleShot = true;
			break;
		case 'gatlingGuns':
			newStats.gatlingGuns = true;
			break;
		case 'maxHealth':
			newStats.maxHealth = stats.maxHealth + 25;
			break;
		case 'healthRegen':
			newStats.healthRegen = stats.healthRegen * 1.5;
			break;
	}

	return newStats;
}

// Get the highest tier achieved for a given upgrade type
export function getUpgradeTier(upgrades: Upgrade[], type: UpgradeType): number {
	const matching = upgrades.filter((u) => u.type === type);
	if (matching.length === 0) return 0;
	return Math.max(...matching.map((u) => u.tier));
}

// Check if a one-time unlock has been obtained
export function hasUnlock(
	upgrades: Upgrade[],
	type: 'dualCannons' | 'doubleShot' | 'gatlingGuns' | 'acceleration',
): boolean {
	return upgrades.some((u) => u.type === type);
}
