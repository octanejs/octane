/**
 * Shared types for game components
 * Extracted to break circular dependencies
 */

// IslandData type is referenced in other game components
import type { IslandData as _IslandData } from './utils/islandGenerator';

export interface RockCollider {
	position: [number, number];
	radius: number;
}

export type BoatType = 'dinghy' | 'ship';
export type GameStage = 'exploration' | 'battle';

// AI difficulty tier (affects stats)
export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'elite' | 'boss';

export interface OtherPlayer {
	id: string;
	isAI: boolean;
	position: [number, number, number];
	rotation: number;
	velocity: number;
	boatType: BoatType;
	color: string;
	health: number;
	maxHealth?: number; // For AI ships
	difficulty?: AIDifficulty; // For AI ships
	homePosition?: [number, number]; // For AI ships - where they patrol around
}

export interface CoinData {
	id: number;
	position: [number, number, number];
	collected: boolean;
	collectedAt?: number; // Timestamp when collected (for respawn timer)
}

// Cannonball projectile
export interface Cannonball {
	id: number;
	position: [number, number, number];
	velocity: [number, number, number];
	ownerId: string; // 'player' or AI id
	createdAt: number;
	isGatling?: boolean; // Gatling rounds are smaller/faster
}

// Purchased permanent shop boosts (stackable items)
export interface PurchasedBoosts {
	permSpeed: number; // Number of permanent speed boosts purchased
	permAccel: number; // Number of permanent acceleration boosts purchased
	permHealth: number; // Number of permanent health boosts purchased (+25 each, max 8)
	rapidFire: boolean; // Whether rapid fire (auto-loader) is purchased
}

// State that gets persisted to localStorage
export interface PersistedState {
	// Progress
	discoveredIslands: string[];
	coinsCollected: number;
	collectedCoinIds: number[]; // Which specific coins are collected
	unlockedUpgrades: import('./utils/upgrades').Upgrade[];
	shipStats: import('./utils/upgrades').ShipStats;
	kills: number;
	deaths: number;
	purchasedBoosts: PurchasedBoosts;

	// Game state
	stage: GameStage;
	boatType: BoatType;
	showcaseUnlocked: boolean; // Whether showcase expansion is unlocked
	cornersUnlocked: boolean; // Whether corner boss islands are unlocked
	gameWon: boolean; // Whether the player has captured all 4 corners

	// Position
	boatPosition: [number, number, number];
	boatRotation: number;
	boatHealth: number;

	// Active effects
	compassTargetId: string | null; // Store ID, not full object
	speedBoostEndTime: number | null;
}
