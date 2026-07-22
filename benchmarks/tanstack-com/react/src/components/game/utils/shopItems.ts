// Shop items that can be purchased with coins

export type ShopItemType =
	'compass' | 'speedBoost' | 'healthPack' | 'permSpeed' | 'permAccel' | 'permHealth' | 'rapidFire';

export interface ShopItem {
	type: ShopItemType;
	name: string;
	description: string;
	cost: number;
	icon: string;
	// Which stages this item is available in
	stages: ('exploration' | 'battle')[];
	// Whether this item can be purchased multiple times (stacks)
	stackable?: boolean;
	// For stackable items, max number of stacks (0 = unlimited)
	maxStacks?: number;
}

export const SHOP_ITEMS: ShopItem[] = [
	{
		type: 'compass',
		name: 'Compass',
		description: 'Points to a random undiscovered island',
		cost: 10,
		icon: '🧭',
		stages: ['exploration', 'battle'],
	},
	{
		type: 'speedBoost',
		name: 'Speed Boost',
		description: 'Temporary 2x speed for 10 seconds',
		cost: 5,
		icon: '⚡',
		stages: ['exploration', 'battle'],
	},
	{
		type: 'healthPack',
		name: 'Health Pack',
		description: 'Restore 50 health',
		cost: 15,
		icon: '💊',
		stages: ['battle'],
	},
	{
		type: 'permSpeed',
		name: 'Engine Upgrade',
		description: 'Permanent +10% max speed',
		cost: 25,
		icon: '🚤',
		stages: ['battle'],
		stackable: true,
		maxStacks: 0, // Unlimited
	},
	{
		type: 'permAccel',
		name: 'Turbo Intake',
		description: 'Permanent +15% acceleration',
		cost: 20,
		icon: '💨',
		stages: ['battle'],
		stackable: true,
		maxStacks: 0, // Unlimited
	},
	{
		type: 'permHealth',
		name: 'Hull Plating',
		description: 'Permanent +25 max health',
		cost: 30,
		icon: '🛡️',
		stages: ['battle'],
		stackable: true,
		maxStacks: 8, // Max 200 bonus health (300 total with base 100)
	},
	{
		type: 'rapidFire',
		name: 'Auto-Loader',
		description: 'Hold fire to auto-shoot side cannons',
		cost: 50,
		icon: '🔁',
		stages: ['battle'],
		stackable: false,
	},
];

export function getAvailableItems(stage: 'exploration' | 'battle'): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.stages.includes(stage));
}
