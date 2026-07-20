import { create } from 'zustand';
import type { IslandData } from '../utils/islandGenerator';
import {
	type Upgrade,
	type ShipStats,
	BASE_SHIP_STATS,
	applyUpgrade,
	PARTNER_UPGRADE_ORDER,
	SHOWCASE_UPGRADE_ORDER,
} from '../utils/upgrades';
import { type ShopItemType, SHOP_ITEMS } from '../utils/shopItems';
import type {
	RockCollider,
	BoatType,
	GameStage,
	AIDifficulty,
	OtherPlayer,
	CoinData,
	Cannonball,
	PurchasedBoosts,
	PersistedState,
} from '../types';

// Re-export types for consumers
export type {
	RockCollider,
	BoatType,
	GameStage,
	AIDifficulty,
	OtherPlayer,
	CoinData,
	Cannonball,
	PurchasedBoosts,
};

// Keys for localStorage persistence
const STORAGE_KEY = 'tanstack-island-explorer';

// Save to localStorage (immediate, no debounce)
function saveToLocalStorage(state: PersistedState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage errors
	}
}

function loadFromLocalStorage(): PersistedState | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved) as PersistedState;
		}
	} catch {
		// Ignore parse errors
	}
	return null;
}

// Helper to extract persistable state from full game state
function extractPersistedState(state: {
	discoveredIslands: Set<string>;
	coinsCollected: number;
	coins: CoinData[];
	unlockedUpgrades: Upgrade[];
	shipStats: ShipStats;
	kills: number;
	deaths: number;
	purchasedBoosts: PurchasedBoosts;
	stage: GameStage;
	boatType: BoatType;
	showcaseUnlocked: boolean;
	cornersUnlocked: boolean;
	gameWon: boolean;
	boatPosition: [number, number, number];
	boatRotation: number;
	boatHealth: number;
	compassTarget: IslandData | null;
	speedBoostEndTime: number | null;
}): PersistedState {
	return {
		discoveredIslands: Array.from(state.discoveredIslands),
		coinsCollected: state.coinsCollected,
		collectedCoinIds: state.coins.filter((c) => c.collected).map((c) => c.id),
		unlockedUpgrades: state.unlockedUpgrades,
		shipStats: state.shipStats,
		kills: state.kills,
		deaths: state.deaths,
		purchasedBoosts: state.purchasedBoosts,
		stage: state.stage,
		boatType: state.boatType,
		showcaseUnlocked: state.showcaseUnlocked,
		cornersUnlocked: state.cornersUnlocked,
		gameWon: state.gameWon,
		boatPosition: state.boatPosition,
		boatRotation: state.boatRotation,
		boatHealth: state.boatHealth,
		compassTargetId: state.compassTarget?.id ?? null,
		speedBoostEndTime: state.speedBoostEndTime,
	};
}

interface GameState {
	// Game phase
	phase: 'intro' | 'playing' | 'upgrading' | 'complete' | 'gameover';
	setPhase: (phase: GameState['phase']) => void;

	// Game stage (exploration = dinghy, battle = ship + multiplayer)
	stage: GameStage;
	setStage: (stage: GameStage) => void;

	// Boat type and upgrades
	boatType: BoatType;
	setBoatType: (type: BoatType) => void;

	// Ship stats (upgradeable)
	shipStats: ShipStats;
	unlockedUpgrades: Upgrade[];
	lastUnlockedUpgrade: Upgrade | null; // For showing notification
	applyShipUpgrade: (upgrade: Upgrade) => void;
	clearLastUnlockedUpgrade: () => void;

	// Boat state
	boatPosition: [number, number, number];
	boatRotation: number;
	boatVelocity: number;
	boatHealth: number;
	isMovingForward: boolean;
	isMovingBackward: boolean;
	isTurningLeft: boolean;
	isTurningRight: boolean;

	// Boat actions
	setBoatPosition: (pos: [number, number, number]) => void;
	setBoatRotation: (rot: number) => void;
	setBoatVelocity: (vel: number) => void;
	setBoatHealth: (health: number) => void;
	setMovingForward: (moving: boolean) => void;
	setMovingBackward: (moving: boolean) => void;
	setTurningLeft: (turning: boolean) => void;
	setTurningRight: (turning: boolean) => void;

	// World boundary (expands after upgrade)
	worldBoundary: number;
	setWorldBoundary: (boundary: number) => void;

	// Other players (AI + real multiplayer)
	otherPlayers: OtherPlayer[];
	setOtherPlayers: (players: OtherPlayer[]) => void;
	updateOtherPlayer: (id: string, data: Partial<OtherPlayer>) => void;

	// Discovery
	discoveredIslands: Set<string>;
	nearbyIsland: IslandData | null;
	discoveryProgress: number; // 0-1 progress toward discovering current nearby island
	discoverIsland: (id: string) => void;
	setNearbyIsland: (island: IslandData | null) => void;
	setDiscoveryProgress: (progress: number) => void;

	// Islands (core library islands + expanded partner/showcase islands)
	islands: IslandData[];
	expandedIslands: IslandData[]; // Partner/showcase islands in expanded zone
	showcaseIslands: IslandData[]; // Showcase islands (unlocked after all partners)
	cornerIslands: IslandData[]; // Corner boss islands
	showcaseUnlocked: boolean; // Whether showcase expansion is unlocked
	cornersUnlocked: boolean; // Whether corner boss islands are unlocked
	gameWon: boolean; // Whether the player has captured all 4 corners
	setIslands: (islands: IslandData[]) => void;
	setExpandedIslands: (islands: IslandData[]) => void;
	setShowcaseIslands: (islands: IslandData[]) => void;
	setCornerIslands: (islands: IslandData[]) => void;
	unlockShowcase: () => void;
	unlockCorners: () => void;

	// Rock colliders
	rockColliders: RockCollider[];
	setRockColliders: (rocks: RockCollider[]) => void;

	// Coins
	coins: CoinData[];
	coinsCollected: number;
	setCoins: (coins: CoinData[]) => void;
	collectCoin: (id: number) => void;
	respawnCoins: () => void; // Respawn coins that have been collected for long enough

	// Boundary collision (which edges are being hit)
	boundaryEdges: {
		north: boolean;
		south: boolean;
		east: boolean;
		west: boolean;
	};
	setBoundaryEdges: (edges: {
		north: boolean;
		south: boolean;
		east: boolean;
		west: boolean;
	}) => void;

	// Cannonballs
	cannonballs: Cannonball[];
	lastFireTime: number;
	lastGatlingTime: number;
	fireCannon: () => void;
	fireGatling: () => void;
	updateCannonballs: (cannonballs: Cannonball[]) => void;
	removeCannonball: (id: number) => void;

	// Audio
	isMuted: boolean;
	toggleMute: () => void;

	// Shop
	isShopOpen: boolean;
	openShop: () => void;
	closeShop: () => void;
	purchaseItem: (itemType: ShopItemType) => boolean;

	// Active items/effects
	compassTarget: IslandData | null; // Island the compass is pointing to
	speedBoostEndTime: number | null; // Timestamp when speed boost ends
	setCompassTarget: (island: IslandData | null) => void;
	clearCompassOnDiscover: (islandId: string) => void;

	// Debug
	showCollisionDebug: boolean;
	setShowCollisionDebug: (show: boolean) => void;
	debugZoomOut: boolean;
	setDebugZoomOut: (zoom: boolean) => void;

	// Stats tracking
	kills: number;
	deaths: number;
	addKill: () => void;
	addDeath: () => void;

	// Purchased permanent boosts
	purchasedBoosts: PurchasedBoosts;

	// Upgrade to ship (called when all core islands discovered)
	upgradeToShip: () => void;

	// Reset
	reset: () => void;

	// Restart battle (keep discoveries, reset battle state)
	restartBattle: () => void;

	// Start over (full reset including localStorage)
	startOver: () => void;
}

// Initial world boundary for exploration stage
const INITIAL_WORLD_BOUNDARY = 85;
// Expanded world boundary after upgrading to ship
const EXPANDED_WORLD_BOUNDARY = 180;

const initialState = {
	phase: 'intro' as const,
	stage: 'exploration' as GameStage,
	boatType: 'dinghy' as BoatType,
	shipStats: { ...BASE_SHIP_STATS } as ShipStats,
	unlockedUpgrades: [] as Upgrade[],
	lastUnlockedUpgrade: null as Upgrade | null,
	boatPosition: [0, 0, 0] as [number, number, number],
	boatRotation: 0,
	boatVelocity: 0,
	boatHealth: 100,
	isMovingForward: false,
	isMovingBackward: false,
	isTurningLeft: false,
	isTurningRight: false,
	worldBoundary: INITIAL_WORLD_BOUNDARY,
	otherPlayers: [] as OtherPlayer[],
	discoveredIslands: new Set<string>(),
	nearbyIsland: null,
	discoveryProgress: 0,
	islands: [] as IslandData[],
	expandedIslands: [] as IslandData[],
	showcaseIslands: [] as IslandData[],
	cornerIslands: [] as IslandData[],
	showcaseUnlocked: false,
	cornersUnlocked: false,
	gameWon: false,
	rockColliders: [] as RockCollider[],
	coins: [] as CoinData[],
	coinsCollected: 0,
	boundaryEdges: { north: false, south: false, east: false, west: false },
	cannonballs: [] as Cannonball[],
	lastFireTime: 0,
	lastGatlingTime: 0,
	isMuted: false,
	isShopOpen: false,
	compassTarget: null as IslandData | null,
	speedBoostEndTime: null as number | null,
	showCollisionDebug: false,
	debugZoomOut: false,
	kills: 0,
	deaths: 0,
	purchasedBoosts: {
		permSpeed: 0,
		permAccel: 0,
		permHealth: 0,
		rapidFire: false,
	} as PurchasedBoosts,
};

// Load initial state from localStorage if available
const loadedState = loadFromLocalStorage();

// Store loaded compass target ID to restore after islands are generated
let pendingCompassTargetId: string | null = loadedState?.compassTargetId ?? null;
let pendingCollectedCoinIds: number[] = loadedState?.collectedCoinIds ?? [];

export const useGameStore = create<GameState>()((set, get) => ({
	...initialState,
	// Override with loaded state if available
	...(loadedState
		? {
				discoveredIslands: new Set(loadedState.discoveredIslands || []),
				coinsCollected: loadedState.coinsCollected ?? initialState.coinsCollected,
				unlockedUpgrades: loadedState.unlockedUpgrades ?? initialState.unlockedUpgrades,
				shipStats: loadedState.shipStats ?? initialState.shipStats,
				kills: loadedState.kills ?? initialState.kills,
				deaths: loadedState.deaths ?? initialState.deaths,
				stage: loadedState.stage ?? initialState.stage,
				boatType: loadedState.boatType ?? initialState.boatType,
				boatPosition: loadedState.boatPosition ?? initialState.boatPosition,
				boatRotation: loadedState.boatRotation ?? initialState.boatRotation,
				boatHealth: loadedState.boatHealth ?? initialState.boatHealth,
				// Restore speed boost if it hasn't expired
				speedBoostEndTime:
					loadedState.speedBoostEndTime && loadedState.speedBoostEndTime > Date.now()
						? loadedState.speedBoostEndTime
						: null,
				phase:
					loadedState.discoveredIslands && loadedState.discoveredIslands.length > 0
						? ('playing' as const)
						: ('intro' as const),
				worldBoundary: loadedState.showcaseUnlocked
					? 520 // Showcase zone boundary
					: loadedState.stage === 'battle'
						? EXPANDED_WORLD_BOUNDARY
						: INITIAL_WORLD_BOUNDARY,
				showcaseUnlocked: loadedState.showcaseUnlocked ?? false,
				cornersUnlocked: loadedState.cornersUnlocked ?? false,
				purchasedBoosts: loadedState.purchasedBoosts ?? initialState.purchasedBoosts,
			}
		: {}),

	setPhase: (phase) => set({ phase }),
	setStage: (stage) => set({ stage }),
	setBoatType: (boatType) => set({ boatType }),
	applyShipUpgrade: (upgrade: Upgrade) => {
		const { shipStats, unlockedUpgrades, boatHealth } = get();
		// Check if we already have this exact upgrade (same type and tier)
		const alreadyHave = unlockedUpgrades.some(
			(u) => u.type === upgrade.type && u.tier === upgrade.tier,
		);
		if (alreadyHave) return;
		const newStats = applyUpgrade(shipStats, upgrade);

		// If maxHealth increased, also heal by that amount
		const healthGain = newStats.maxHealth - shipStats.maxHealth;
		const newHealth = healthGain > 0 ? boatHealth + healthGain : boatHealth;

		set({
			shipStats: newStats,
			unlockedUpgrades: [...unlockedUpgrades, upgrade],
			boatHealth: newHealth,
		});
	},
	clearLastUnlockedUpgrade: () => set({ lastUnlockedUpgrade: null }),

	setBoatPosition: (boatPosition) => set({ boatPosition }),
	setBoatRotation: (boatRotation) => set({ boatRotation }),
	setBoatVelocity: (boatVelocity) => set({ boatVelocity }),
	setBoatHealth: (boatHealth) => set({ boatHealth }),
	setMovingForward: (isMovingForward) => set({ isMovingForward }),
	setMovingBackward: (isMovingBackward) => set({ isMovingBackward }),
	setTurningLeft: (isTurningLeft) => set({ isTurningLeft }),
	setTurningRight: (isTurningRight) => set({ isTurningRight }),

	setWorldBoundary: (worldBoundary) => set({ worldBoundary }),

	setOtherPlayers: (otherPlayers) => set({ otherPlayers }),
	updateOtherPlayer: (id, data) =>
		set((state) => ({
			otherPlayers: state.otherPlayers.map((p) => (p.id === id ? { ...p, ...data } : p)),
		})),

	discoverIsland: (id) => {
		const {
			discoveredIslands,
			islands,
			expandedIslands,
			showcaseIslands,
			showcaseUnlocked,
			cornersUnlocked,
			stage,
			unlockedUpgrades: _unlockedUpgrades,
			compassTarget,
		} = get();
		if (!discoveredIslands.has(id)) {
			const newDiscovered = new Set(discoveredIslands);
			newDiscovered.add(id);
			set({ discoveredIslands: newDiscovered });

			// Clear compass target if this is the target island
			if (compassTarget?.id === id) {
				set({ compassTarget: null });
			}

			// Check if all core islands discovered (triggers upgrade in exploration stage)
			if (stage === 'exploration' && newDiscovered.size === islands.length) {
				// Trigger upgrade sequence instead of complete
				get().upgradeToShip();
			}

			// In battle stage, handle partner/showcase island discoveries
			if (stage === 'battle') {
				const partnerIsland = expandedIslands.find((i) => i.id === id);
				const showcaseIsland = showcaseIslands.find((i) => i.id === id);

				if (partnerIsland && partnerIsland.type === 'partner') {
					// Count discovered partner islands
					const discoveredPartnerCount = Array.from(newDiscovered).filter((discoveredId) =>
						expandedIslands.some((i) => i.id === discoveredId && i.type === 'partner'),
					).length;

					// Grant next partner upgrade (0-indexed)
					const upgradeIndex = discoveredPartnerCount - 1;
					const nextUpgrade = PARTNER_UPGRADE_ORDER[upgradeIndex];
					if (nextUpgrade) {
						get().applyShipUpgrade(nextUpgrade);
						set({ lastUnlockedUpgrade: nextUpgrade });
					}

					// Check if all partner islands discovered - unlock showcase
					const totalPartnerIslands = expandedIslands.filter((i) => i.type === 'partner').length;
					console.log(
						`[Game] Partner discovered: ${discoveredPartnerCount}/${totalPartnerIslands}, showcaseUnlocked: ${showcaseUnlocked}`,
					);
					if (!showcaseUnlocked && discoveredPartnerCount === totalPartnerIslands) {
						console.log('[Game] All partners discovered! Unlocking showcase...');
						get().unlockShowcase();
					}
				}

				if (showcaseIsland && showcaseIsland.type === 'showcase') {
					// Count discovered showcase islands (exclude corner islands which also use showcase type)
					const realShowcaseIslands = showcaseIslands.filter((i) => !i.id.startsWith('corner-'));
					const discoveredShowcaseCount = Array.from(newDiscovered).filter((discoveredId) =>
						realShowcaseIslands.some((i) => i.id === discoveredId),
					).length;

					// Grant next showcase upgrade (0-indexed)
					const upgradeIndex = discoveredShowcaseCount - 1;
					const nextUpgrade = SHOWCASE_UPGRADE_ORDER[upgradeIndex];
					if (nextUpgrade) {
						get().applyShipUpgrade(nextUpgrade);
						set({ lastUnlockedUpgrade: nextUpgrade });
					}

					// Check if all showcase islands discovered - unlock corners
					if (
						!cornersUnlocked &&
						discoveredShowcaseCount === realShowcaseIslands.length &&
						realShowcaseIslands.length > 0
					) {
						get().unlockCorners();
					}
				}

				// Check if a corner island was discovered
				const { cornerIslands, gameWon } = get();
				const cornerIsland = cornerIslands.find((i) => i.id === id);
				if (cornerIsland && !gameWon) {
					// Count discovered corner islands
					const discoveredCornerCount = Array.from(newDiscovered).filter((discoveredId) =>
						cornerIslands.some((i) => i.id === discoveredId),
					).length;

					// Check if all 4 corners discovered - player wins!
					if (discoveredCornerCount === cornerIslands.length && cornerIslands.length === 4) {
						set({ gameWon: true });
					}
				}
			}
		}
	},

	setNearbyIsland: (nearbyIsland) => set({ nearbyIsland }),
	setDiscoveryProgress: (discoveryProgress) => set({ discoveryProgress }),

	setIslands: (islands) => {
		set({ islands });
		// Restore compass target from pending ID if we have one
		if (pendingCompassTargetId) {
			const target = islands.find((i) => i.id === pendingCompassTargetId);
			if (target) {
				set({ compassTarget: target });
				pendingCompassTargetId = null;
			}
		}
	},
	setExpandedIslands: (expandedIslands) => {
		set({ expandedIslands });
		// Also check expanded islands for compass target
		if (pendingCompassTargetId) {
			const target = expandedIslands.find((i) => i.id === pendingCompassTargetId);
			if (target) {
				set({ compassTarget: target });
				pendingCompassTargetId = null;
			}
		}
	},

	setShowcaseIslands: (showcaseIslands) => {
		set({ showcaseIslands });
		// Check showcase islands for compass target
		if (pendingCompassTargetId) {
			const target = showcaseIslands.find((i) => i.id === pendingCompassTargetId);
			if (target) {
				set({ compassTarget: target });
				pendingCompassTargetId = null;
			}
		}
	},

	unlockShowcase: () => {
		set({ showcaseUnlocked: true });
	},

	setCornerIslands: (cornerIslands) => {
		set({ cornerIslands });
	},

	unlockCorners: () => {
		set({ cornersUnlocked: true });
	},

	setRockColliders: (rockColliders) => set({ rockColliders }),

	setCoins: (coins) => {
		// Restore collected state from pending IDs
		if (pendingCollectedCoinIds.length > 0) {
			const collectedSet = new Set(pendingCollectedCoinIds);
			const restoredCoins = coins.map((c) =>
				collectedSet.has(c.id) ? { ...c, collected: true } : c,
			);
			set({ coins: restoredCoins });
			pendingCollectedCoinIds = [];
		} else {
			set({ coins });
		}
	},

	collectCoin: (id) => {
		const { coins, coinsCollected } = get();
		const coin = coins.find((c) => c.id === id);
		if (coin && !coin.collected) {
			const newCoins = coins.map((c) =>
				c.id === id ? { ...c, collected: true, collectedAt: Date.now() } : c,
			);
			set({ coins: newCoins, coinsCollected: coinsCollected + 1 });
		}
	},

	respawnCoins: () => {
		const { coins } = get();
		const now = Date.now();
		const RESPAWN_DELAY = 60000; // 60 seconds to respawn

		let hasChanges = false;
		const newCoins = coins.map((c) => {
			if (c.collected && c.collectedAt && now - c.collectedAt > RESPAWN_DELAY) {
				hasChanges = true;
				return { ...c, collected: false, collectedAt: undefined };
			}
			return c;
		});

		if (hasChanges) {
			set({ coins: newCoins });
		}
	},

	toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

	setShowCollisionDebug: (show) => set({ showCollisionDebug: show }),
	debugZoomOut: false,
	setDebugZoomOut: (zoom) => set({ debugZoomOut: zoom }),

	addKill: () => set((state) => ({ kills: state.kills + 1 })),
	addDeath: () => set((state) => ({ deaths: state.deaths + 1 })),

	setBoundaryEdges: (boundaryEdges) => set({ boundaryEdges }),

	fireCannon: () => {
		const { stage, boatPosition, boatRotation, cannonballs, lastFireTime, shipStats } = get();
		if (stage !== 'battle') return;

		const now = Date.now();
		if (now - lastFireTime < shipStats.sideFireRate) return;

		const newCannonballs: Cannonball[] = [];
		const cannonOffset = 0.5;
		const baseSpeed = 20 * shipStats.cannonRange;

		// Helper to create a cannonball
		// Ship forward is [sin(rotation), cos(rotation)]
		// Ship right (starboard) is [cos(rotation), -sin(rotation)]
		const createBall = (side: 'right' | 'left', spreadAngle: number = 0): Cannonball => {
			const sideMultiplier = side === 'right' ? 1 : -1;

			// Position: offset perpendicular to ship heading
			const perpX = Math.cos(boatRotation) * sideMultiplier;
			const perpZ = -Math.sin(boatRotation) * sideMultiplier;
			const fireX = boatPosition[0] + perpX * cannonOffset;
			const fireZ = boatPosition[2] + perpZ * cannonOffset;

			// Velocity: fire perpendicular to ship, with optional spread
			const fireAngle = boatRotation + spreadAngle * sideMultiplier;
			const velX = Math.cos(fireAngle) * baseSpeed * sideMultiplier;
			const velZ = -Math.sin(fireAngle) * baseSpeed * sideMultiplier;

			return {
				id: now + Math.random() * 1000,
				position: [fireX, 0.5, fireZ],
				velocity: [velX, 2, velZ],
				ownerId: 'player',
				createdAt: now,
			};
		};

		// Fire from right side
		newCannonballs.push(createBall('right'));
		if (shipStats.doubleShot) {
			newCannonballs.push(createBall('right', 0.15)); // Spread shot
		}

		// Fire from left side if dual cannons
		if (shipStats.dualCannons) {
			newCannonballs.push(createBall('left'));
			if (shipStats.doubleShot) {
				newCannonballs.push(createBall('left', 0.15));
			}
		}

		set({
			cannonballs: [...cannonballs, ...newCannonballs],
			lastFireTime: now,
		});
	},

	// Gatling gun fire (forward facing, rapid)
	fireGatling: () => {
		const { stage, boatPosition, boatRotation, cannonballs, shipStats, lastGatlingTime } = get();
		if (stage !== 'battle' || !shipStats.gatlingGuns) return;

		const now = Date.now();
		if (now - lastGatlingTime < shipStats.frontFireRate) return;

		// Fire forward
		const speed = 35;
		const velX = Math.sin(boatRotation) * speed;
		const velZ = Math.cos(boatRotation) * speed;

		// Slight spread
		const spread = (Math.random() - 0.5) * 0.1;

		const newBall: Cannonball = {
			id: now + Math.random() * 1000,
			position: [boatPosition[0], 0.4, boatPosition[2]],
			velocity: [velX + spread * speed, 0.5, velZ + spread * speed],
			ownerId: 'player',
			createdAt: now,
			isGatling: true,
		};

		set({
			cannonballs: [...cannonballs, newBall],
			lastGatlingTime: now,
		});
	},

	updateCannonballs: (cannonballs) => set({ cannonballs }),

	removeCannonball: (id) =>
		set((state) => ({
			cannonballs: state.cannonballs.filter((c) => c.id !== id),
		})),

	upgradeToShip: () => {
		set({
			phase: 'upgrading',
			// boatType stays 'dinghy' until user clicks "Set Sail"
			stage: 'battle',
			worldBoundary: EXPANDED_WORLD_BOUNDARY,
			boatHealth: 100,
		});
		// User must click button to continue - no auto timeout
	},

	// Shop actions
	openShop: () => set({ isShopOpen: true }),
	closeShop: () => set({ isShopOpen: false }),

	purchaseItem: (itemType) => {
		const {
			coinsCollected,
			stage,
			boatHealth,
			shipStats,
			islands,
			expandedIslands,
			discoveredIslands,
			purchasedBoosts,
		} = get();
		const item = SHOP_ITEMS.find((i) => i.type === itemType);

		if (!item) return false;
		if (coinsCollected < item.cost) return false;
		if (!item.stages.includes(stage)) return false;

		// Check max stacks for stackable items
		if (item.stackable && item.maxStacks && item.maxStacks > 0) {
			const currentStacks =
				itemType === 'permSpeed'
					? purchasedBoosts.permSpeed
					: itemType === 'permAccel'
						? purchasedBoosts.permAccel
						: 0;
			if (currentStacks >= item.maxStacks) return false;
		}

		// Check if non-stackable item already owned
		if (itemType === 'rapidFire' && purchasedBoosts.rapidFire) return false;

		// Deduct coins
		set({ coinsCollected: coinsCollected - item.cost });

		switch (itemType) {
			case 'compass': {
				// Find a random undiscovered island
				const allIslands = stage === 'battle' ? [...islands, ...expandedIslands] : islands;
				const undiscovered = allIslands.filter((i) => !discoveredIslands.has(i.id));
				if (undiscovered.length > 0) {
					// Pick random (not nearest)
					const randomIndex = Math.floor(Math.random() * undiscovered.length);
					set({ compassTarget: undiscovered[randomIndex] });
				}
				break;
			}
			case 'speedBoost': {
				// 10 second speed boost
				set({ speedBoostEndTime: Date.now() + 10000 });
				break;
			}
			case 'healthPack': {
				// Restore 50 health, up to max (including purchased health boosts)
				const maxHealth = shipStats.maxHealth + purchasedBoosts.permHealth * 25;
				const newHealth = Math.min(boatHealth + 50, maxHealth);
				set({ boatHealth: newHealth });
				break;
			}
			case 'permSpeed': {
				// Permanent +10% speed boost
				set({
					purchasedBoosts: {
						...purchasedBoosts,
						permSpeed: purchasedBoosts.permSpeed + 1,
					},
				});
				break;
			}
			case 'permAccel': {
				// Permanent +15% acceleration boost
				set({
					purchasedBoosts: {
						...purchasedBoosts,
						permAccel: purchasedBoosts.permAccel + 1,
					},
				});
				break;
			}
			case 'permHealth': {
				// Permanent +25 max health boost
				const newPermHealth = purchasedBoosts.permHealth + 1;
				const healthBonus = 25; // Each purchase adds 25 max health
				set({
					purchasedBoosts: {
						...purchasedBoosts,
						permHealth: newPermHealth,
					},
					// Also increase current health by the bonus amount
					boatHealth: boatHealth + healthBonus,
				});
				break;
			}
			case 'rapidFire': {
				// Unlock auto-loader (rapid fire side cannons)
				set({
					purchasedBoosts: {
						...purchasedBoosts,
						rapidFire: true,
					},
				});
				break;
			}
		}

		set({ isShopOpen: false });
		return true;
	},

	setCompassTarget: (island) => set({ compassTarget: island }),

	clearCompassOnDiscover: (islandId) => {
		const { compassTarget } = get();
		if (compassTarget?.id === islandId) {
			set({ compassTarget: null });
		}
	},

	reset: () =>
		set({
			...initialState,
			islands: get().islands,
			expandedIslands: get().expandedIslands,
			rockColliders: get().rockColliders,
			coins: get().coins.map((c) => ({ ...c, collected: false })),
			discoveredIslands: new Set<string>(),
			kills: 0,
			deaths: 0,
		}),

	startOver: () => {
		// Clear localStorage
		localStorage.removeItem(STORAGE_KEY);
		// Full reset
		set({
			...initialState,
			islands: get().islands,
			expandedIslands: [], // Clear expanded islands
			showcaseIslands: [], // Clear showcase islands
			cornerIslands: [], // Clear corner islands
			showcaseUnlocked: false,
			cornersUnlocked: false,
			gameWon: false,
			rockColliders: get().rockColliders,
			coins: get().coins.map((c) => ({ ...c, collected: false })),
			discoveredIslands: new Set<string>(),
		});
	},

	restartBattle: () => {
		const {
			islands,
			expandedIslands,
			showcaseIslands,
			cornerIslands,
			showcaseUnlocked,
			cornersUnlocked,
			rockColliders,
			coins,
			discoveredIslands,
			unlockedUpgrades,
			shipStats,
			purchasedBoosts,
			boatPosition,
		} = get();

		// World boundary depends on showcase unlock status
		const worldBoundary = showcaseUnlocked ? 520 : EXPANDED_WORLD_BOUNDARY;

		// Find nearest discovered island to respawn at
		const allIslands = [...islands, ...expandedIslands, ...showcaseIslands, ...cornerIslands];
		const discoveredIslandsList = allIslands.filter((i) => discoveredIslands.has(i.id));

		let spawnPosition: [number, number, number] = [0, 0, 0];
		if (discoveredIslandsList.length > 0) {
			// Find nearest discovered island to death position
			let nearestIsland = discoveredIslandsList[0];
			let nearestDist = Infinity;
			for (const island of discoveredIslandsList) {
				const dx = island.position[0] - boatPosition[0];
				const dz = island.position[2] - boatPosition[2];
				const dist = dx * dx + dz * dz;
				if (dist < nearestDist) {
					nearestDist = dist;
					nearestIsland = island;
				}
			}
			// Spawn slightly away from the island (not inside it)
			const spawnOffset = 8;
			const angle = Math.random() * Math.PI * 2;
			spawnPosition = [
				nearestIsland.position[0] + Math.cos(angle) * spawnOffset,
				0,
				nearestIsland.position[2] + Math.sin(angle) * spawnOffset,
			];
		}

		// Calculate total max health (upgrades + purchased boosts)
		const totalMaxHealth = shipStats.maxHealth + purchasedBoosts.permHealth * 25;

		set({
			phase: 'playing',
			stage: 'battle',
			boatType: 'ship',
			boatPosition: spawnPosition,
			boatRotation: 0,
			boatVelocity: 0,
			boatHealth: totalMaxHealth,
			isMovingForward: false,
			isMovingBackward: false,
			isTurningLeft: false,
			isTurningRight: false,
			worldBoundary,
			otherPlayers: [],
			cannonballs: [],
			lastFireTime: 0,
			lastGatlingTime: 0,
			compassTarget: null,
			speedBoostEndTime: null,
			nearbyIsland: null,
			discoveryProgress: 0,
			coinsCollected: get().coinsCollected, // Keep all coins on death
			// Keep these
			islands,
			expandedIslands,
			showcaseIslands,
			cornerIslands,
			showcaseUnlocked,
			cornersUnlocked,
			rockColliders,
			coins: coins.map((c) => ({ ...c, collected: false })), // Respawn all coins
			discoveredIslands,
			unlockedUpgrades,
			shipStats,
			purchasedBoosts,
		});
	},
}));

// Periodic auto-save and beforeunload handler (client-side only)
if (typeof window !== 'undefined') {
	// Auto-save every 5 seconds
	setInterval(() => {
		const state = useGameStore.getState();
		// Only save if game is active
		if (state.phase === 'playing' || state.phase === 'gameover') {
			saveToLocalStorage(extractPersistedState(state));
		}
	}, 5000);

	// Also save when page is about to unload
	window.addEventListener('beforeunload', () => {
		const state = useGameStore.getState();
		saveToLocalStorage(extractPersistedState(state));
	});
}
