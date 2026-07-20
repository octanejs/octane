import type { CoinData } from '../hooks/useGameStore';
import type { IslandData } from './islandGenerator';
import { WORLD_BOUNDARY } from './islandGenerator';

const COIN_COUNT = 50;
const ISLAND_COIN_COUNT = 25; // Coins spawned near islands
const EXPANDED_COIN_COUNT = 60; // Additional coins for battle mode
const MIN_DIST_FROM_ISLAND = 8;
const MAX_DIST_FROM_ISLAND = 18; // For island-adjacent coins
const MIN_DIST_FROM_COIN = 5;
const MIN_DIST_FROM_CENTER = 10; // Don't spawn too close to start

// Must match useGameStore
const EXPANDED_WORLD_BOUNDARY = 180;

function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

export function generateCoins(islands: IslandData[]): CoinData[] {
	const coins: CoinData[] = [];
	const positions: [number, number][] = [];

	// First, spawn coins near islands to promote early exploration
	let attempts = 0;
	const maxIslandAttempts = ISLAND_COIN_COUNT * 30;

	while (coins.length < ISLAND_COIN_COUNT + 1 && attempts < maxIslandAttempts) {
		attempts++;
		const seed = attempts * 7919;

		// Pick a random island
		const islandIndex = Math.floor(seededRandom(seed) * islands.length);
		const island = islands[islandIndex];

		// Generate position around the island
		const angle = seededRandom(seed + 1) * Math.PI * 2;
		const minDist = MIN_DIST_FROM_ISLAND * island.scale;
		const maxDist = MAX_DIST_FROM_ISLAND * island.scale;
		const dist = minDist + seededRandom(seed + 2) * (maxDist - minDist);

		const x = island.position[0] + Math.cos(angle) * dist;
		const z = island.position[2] + Math.sin(angle) * dist;

		// Check bounds
		if (Math.abs(x) > WORLD_BOUNDARY - 10 || Math.abs(z) > WORLD_BOUNDARY - 10) continue;

		// Check distance from other coins
		let tooCloseToCoin = false;
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const d = Math.sqrt(dx * dx + dz * dz);
			if (d < MIN_DIST_FROM_COIN) {
				tooCloseToCoin = true;
				break;
			}
		}
		if (tooCloseToCoin) continue;

		positions.push([x, z]);
		coins.push({
			id: coins.length,
			position: [x, 0.5, z],
			collected: false,
		});
	}

	// Then fill remaining coins randomly
	attempts = 0;
	const maxAttempts = COIN_COUNT * 20;

	while (coins.length < COIN_COUNT && attempts < maxAttempts) {
		attempts++;
		const seed = (attempts + 10000) * 7919;

		const margin = 10;
		const x = (seededRandom(seed) - 0.5) * (WORLD_BOUNDARY - margin) * 2;
		const z = (seededRandom(seed + 1) - 0.5) * (WORLD_BOUNDARY - margin) * 2;

		// Check distance from center (starting area)
		const distFromCenter = Math.sqrt(x * x + z * z);
		if (distFromCenter < MIN_DIST_FROM_CENTER) continue;

		// Check distance from islands
		let tooCloseToIsland = false;
		for (const island of islands) {
			const dx = x - island.position[0];
			const dz = z - island.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);
			const minDist = MIN_DIST_FROM_ISLAND * island.scale;
			if (dist < minDist) {
				tooCloseToIsland = true;
				break;
			}
		}
		if (tooCloseToIsland) continue;

		// Check distance from other coins
		let tooCloseToCoin = false;
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < MIN_DIST_FROM_COIN) {
				tooCloseToCoin = true;
				break;
			}
		}
		if (tooCloseToCoin) continue;

		positions.push([x, z]);
		coins.push({
			id: coins.length,
			position: [x, 0.5, z],
			collected: false,
		});
	}

	return coins;
}

// Generate additional coins for the expanded battle area
export function generateExpandedCoins(
	existingCoins: CoinData[],
	allIslands: IslandData[],
): CoinData[] {
	const coins: CoinData[] = [...existingCoins];
	const positions: [number, number][] = existingCoins.map((c) => [c.position[0], c.position[2]]);

	let attempts = 0;
	const maxAttempts = EXPANDED_COIN_COUNT * 30;
	const targetCount = existingCoins.length + EXPANDED_COIN_COUNT;

	while (coins.length < targetCount && attempts < maxAttempts) {
		attempts++;
		const seed = (attempts + 10000) * 7919;

		const margin = 15;
		// Generate in the outer ring (between old boundary and new boundary)
		const angle = seededRandom(seed) * Math.PI * 2;
		const minRadius = WORLD_BOUNDARY - 10; // Start just inside old boundary for overlap
		const maxRadius = EXPANDED_WORLD_BOUNDARY - margin;
		const radius = minRadius + seededRandom(seed + 1) * (maxRadius - minRadius);

		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;

		// Check distance from islands
		let tooCloseToIsland = false;
		for (const island of allIslands) {
			const dx = x - island.position[0];
			const dz = z - island.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);
			const minDist = MIN_DIST_FROM_ISLAND * island.scale;
			if (dist < minDist) {
				tooCloseToIsland = true;
				break;
			}
		}
		if (tooCloseToIsland) continue;

		// Check distance from other coins
		let tooCloseToCoin = false;
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < MIN_DIST_FROM_COIN) {
				tooCloseToCoin = true;
				break;
			}
		}
		if (tooCloseToCoin) continue;

		// Valid position found
		positions.push([x, z]);
		coins.push({
			id: coins.length,
			position: [x, 0.5, z],
			collected: false,
		});
	}

	return coins;
}
