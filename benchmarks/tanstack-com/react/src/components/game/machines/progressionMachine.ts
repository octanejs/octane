import { assign, setup } from 'xstate';

/**
 * Progression State Machine
 *
 * Tracks game progression through phases and badge tiers.
 * This machine handles high-level game state transitions while
 * zustand continues to manage real-time game state (positions, health, etc.)
 *
 * States:
 * - intro: Initial screen before starting
 * - exploration: Dinghy phase, discovering library islands
 * - upgrading: Overlay showing ship upgrade (libraries complete)
 * - battle.partners: Ship phase, discovering partner islands
 * - battle.showcase: Showcase islands unlocked (partners complete)
 * - battle.corners: Corner islands unlocked (showcases complete)
 * - gameover: Ship destroyed, can respawn
 * - victory: All corners captured
 *
 * Badges earned:
 * - explorer: Complete library exploration
 * - adventurer: Discover all partners
 * - champion: Discover all showcases
 * - conqueror: Capture all corners
 */

export type BadgeTier =
	| 'none'
	| 'explorer' // Completed library exploration
	| 'adventurer' // Discovered all partners
	| 'champion' // Discovered all showcases
	| 'conqueror'; // Captured all corners

export const BADGE_INFO: Record<
	BadgeTier,
	{ name: string; description: string; color: string; icon: string }
> = {
	none: {
		name: 'None',
		description: 'Start your journey',
		color: '#6b7280',
		icon: '🚣',
	},
	explorer: {
		name: 'Explorer',
		description: 'Discovered all TanStack libraries',
		color: '#06b6d4',
		icon: '⭐',
	},
	adventurer: {
		name: 'Adventurer',
		description: 'Allied with all partners',
		color: '#f59e0b',
		icon: '🌟',
	},
	champion: {
		name: 'Champion',
		description: 'Conquered the showcase islands',
		color: '#8b5cf6',
		icon: '💫',
	},
	conqueror: {
		name: 'Conqueror',
		description: 'Defeated all corner bosses',
		color: '#ef4444',
		icon: '🏆',
	},
};

export interface ProgressionContext {
	highestBadge: BadgeTier;
	newBadgeEarned: BadgeTier | null; // For showing badge earned overlay
	librariesDiscovered: number;
	librariesTotal: number;
	partnersDiscovered: number;
	partnersTotal: number;
	showcasesDiscovered: number;
	showcasesTotal: number;
	cornersDiscovered: number;
	cornersTotal: number;
}

export type ProgressionEvent =
	| { type: 'START_GAME' }
	| { type: 'DISCOVER_LIBRARY' }
	| { type: 'DISCOVER_PARTNER' }
	| { type: 'DISCOVER_SHOWCASE' }
	| { type: 'DISCOVER_CORNER' }
	| { type: 'UPGRADE_COMPLETE' }
	| { type: 'SHIP_DESTROYED' }
	| { type: 'RESPAWN' }
	| { type: 'DISMISS_VICTORY' }
	| { type: 'DISMISS_BADGE' }
	| { type: 'RESET' }
	| {
			type: 'SET_TOTALS';
			libraries: number;
			partners: number;
			showcases: number;
			corners: number;
	  }
	| {
			type: 'RESTORE_PROGRESS';
			librariesDiscovered: number;
			partnersDiscovered: number;
			showcasesDiscovered: number;
			cornersDiscovered: number;
			highestBadge: BadgeTier;
	  };

export const progressionMachine = setup({
	types: {
		context: {} as ProgressionContext,
		events: {} as ProgressionEvent,
	},
	guards: {
		allLibrariesDiscovered: ({ context }) =>
			context.librariesDiscovered >= context.librariesTotal && context.librariesTotal > 0,
		allPartnersDiscovered: ({ context }) =>
			context.partnersDiscovered >= context.partnersTotal && context.partnersTotal > 0,
		allShowcasesDiscovered: ({ context }) =>
			context.showcasesDiscovered >= context.showcasesTotal && context.showcasesTotal > 0,
		allCornersDiscovered: ({ context }) =>
			context.cornersDiscovered >= context.cornersTotal && context.cornersTotal > 0,
	},
	actions: {
		incrementLibraries: assign({
			librariesDiscovered: ({ context }) => context.librariesDiscovered + 1,
		}),
		incrementPartners: assign({
			partnersDiscovered: ({ context }) => context.partnersDiscovered + 1,
		}),
		incrementShowcases: assign({
			showcasesDiscovered: ({ context }) => context.showcasesDiscovered + 1,
		}),
		incrementCorners: assign({
			cornersDiscovered: ({ context }) => context.cornersDiscovered + 1,
		}),
		earnExplorerBadge: assign({
			highestBadge: 'explorer' as BadgeTier,
			newBadgeEarned: 'explorer' as BadgeTier,
		}),
		earnAdventurerBadge: assign({
			highestBadge: 'adventurer' as BadgeTier,
			newBadgeEarned: 'adventurer' as BadgeTier,
		}),
		earnChampionBadge: assign({
			highestBadge: 'champion' as BadgeTier,
			newBadgeEarned: 'champion' as BadgeTier,
		}),
		earnConquerorBadge: assign({
			highestBadge: 'conqueror' as BadgeTier,
			newBadgeEarned: 'conqueror' as BadgeTier,
		}),
		clearNewBadge: assign({
			newBadgeEarned: null,
		}),
		setTotals: assign({
			librariesTotal: ({ event }) => (event.type === 'SET_TOTALS' ? event.libraries : 0),
			partnersTotal: ({ event }) => (event.type === 'SET_TOTALS' ? event.partners : 0),
			showcasesTotal: ({ event }) => (event.type === 'SET_TOTALS' ? event.showcases : 0),
			cornersTotal: ({ event }) => (event.type === 'SET_TOTALS' ? event.corners : 0),
		}),
		restoreProgress: assign(({ event }) => {
			if (event.type !== 'RESTORE_PROGRESS') return {};
			return {
				librariesDiscovered: event.librariesDiscovered,
				partnersDiscovered: event.partnersDiscovered,
				showcasesDiscovered: event.showcasesDiscovered,
				cornersDiscovered: event.cornersDiscovered,
				highestBadge: event.highestBadge,
			};
		}),
		resetProgress: assign({
			highestBadge: 'none' as BadgeTier,
			newBadgeEarned: null,
			librariesDiscovered: 0,
			partnersDiscovered: 0,
			showcasesDiscovered: 0,
			cornersDiscovered: 0,
		}),
	},
}).createMachine({
	id: 'progression',
	initial: 'intro',
	context: {
		highestBadge: 'none',
		newBadgeEarned: null,
		librariesDiscovered: 0,
		librariesTotal: 0,
		partnersDiscovered: 0,
		partnersTotal: 0,
		showcasesDiscovered: 0,
		showcasesTotal: 0,
		cornersDiscovered: 0,
		cornersTotal: 0,
	},
	on: {
		SET_TOTALS: { actions: 'setTotals' },
		DISMISS_BADGE: { actions: 'clearNewBadge' },
		RESET: { target: '.intro', actions: 'resetProgress' },
	},
	states: {
		intro: {
			on: {
				START_GAME: 'exploration',
				// Allow restoring to any state
				RESTORE_PROGRESS: [
					{
						guard: ({ event }) =>
							event.type === 'RESTORE_PROGRESS' && event.highestBadge === 'conqueror',
						target: 'victory',
						actions: 'restoreProgress',
					},
					{
						guard: ({ event }) =>
							event.type === 'RESTORE_PROGRESS' && event.highestBadge === 'champion',
						target: 'battle.corners',
						actions: 'restoreProgress',
					},
					{
						guard: ({ event }) =>
							event.type === 'RESTORE_PROGRESS' && event.highestBadge === 'adventurer',
						target: 'battle.showcase',
						actions: 'restoreProgress',
					},
					{
						guard: ({ event }) =>
							event.type === 'RESTORE_PROGRESS' && event.highestBadge === 'explorer',
						target: 'battle.partners',
						actions: 'restoreProgress',
					},
					{
						guard: ({ event }) =>
							event.type === 'RESTORE_PROGRESS' && event.librariesDiscovered > 0,
						target: 'exploration',
						actions: 'restoreProgress',
					},
				],
			},
		},

		exploration: {
			description: 'Dinghy phase - discovering library islands',
			on: {
				DISCOVER_LIBRARY: [
					{
						guard: 'allLibrariesDiscovered',
						target: 'upgrading',
						actions: 'incrementLibraries',
					},
					{ actions: 'incrementLibraries' },
				],
			},
		},

		upgrading: {
			description: 'Showing upgrade overlay - libraries complete',
			entry: 'earnExplorerBadge',
			on: {
				UPGRADE_COMPLETE: 'battle.partners',
			},
		},

		battle: {
			description: 'Ship phase with combat',
			initial: 'partners',
			on: {
				SHIP_DESTROYED: 'gameover',
			},
			states: {
				partners: {
					description: 'Discovering partner islands',
					on: {
						DISCOVER_PARTNER: [
							{
								guard: 'allPartnersDiscovered',
								target: 'showcase',
								actions: ['incrementPartners', 'earnAdventurerBadge'],
							},
							{ actions: 'incrementPartners' },
						],
						// Allow discovering other types without transition
						DISCOVER_LIBRARY: { actions: 'incrementLibraries' },
					},
				},

				showcase: {
					description: 'Discovering showcase islands',
					on: {
						DISCOVER_SHOWCASE: [
							{
								guard: 'allShowcasesDiscovered',
								target: 'corners',
								actions: ['incrementShowcases', 'earnChampionBadge'],
							},
							{ actions: 'incrementShowcases' },
						],
						DISCOVER_PARTNER: { actions: 'incrementPartners' },
						DISCOVER_LIBRARY: { actions: 'incrementLibraries' },
					},
				},

				corners: {
					description: 'Fighting corner bosses',
					on: {
						DISCOVER_CORNER: [
							{
								guard: 'allCornersDiscovered',
								target: '#progression.victory',
								actions: ['incrementCorners', 'earnConquerorBadge'],
							},
							{ actions: 'incrementCorners' },
						],
						DISCOVER_SHOWCASE: { actions: 'incrementShowcases' },
						DISCOVER_PARTNER: { actions: 'incrementPartners' },
						DISCOVER_LIBRARY: { actions: 'incrementLibraries' },
					},
				},
			},
		},

		gameover: {
			description: 'Ship destroyed',
			on: {
				RESPAWN: 'battle',
			},
		},

		victory: {
			description: 'All corners captured - game complete',
			on: {
				DISMISS_VICTORY: 'battle.corners',
			},
		},
	},
});

// Helper to get current phase string from state value
export function getPhaseFromState(
	stateValue: string | object,
): 'intro' | 'playing' | 'upgrading' | 'gameover' | 'victory' {
	if (typeof stateValue === 'string') {
		if (stateValue === 'intro') return 'intro';
		if (stateValue === 'exploration') return 'playing';
		if (stateValue === 'upgrading') return 'upgrading';
		if (stateValue === 'gameover') return 'gameover';
		if (stateValue === 'victory') return 'victory';
	}
	if (typeof stateValue === 'object' && 'battle' in stateValue) {
		return 'playing';
	}
	return 'playing';
}

// Helper to get battle sub-phase
export function getBattlePhase(
	stateValue: string | object,
): 'partners' | 'showcase' | 'corners' | null {
	if (typeof stateValue === 'object' && 'battle' in stateValue) {
		return (stateValue as { battle: 'partners' | 'showcase' | 'corners' }).battle;
	}
	return null;
}
