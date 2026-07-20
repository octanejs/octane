import type { IslandData } from './islandGenerator';
import type { OtherPlayer, RockCollider } from '../types';

export type { RockCollider };

// Seeded random for consistent rock generation
function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

// Generate rock colliders matching OceanRocks component
export function generateRockColliders(
	islands: IslandData[],
	groupCount: number = 20,
	spread: number = 120,
): RockCollider[] {
	const colliders: RockCollider[] = [];
	const minDistFromIsland = 10;

	for (let g = 0; g < groupCount; g++) {
		const groupSeed = g * 54321;

		const groupX = (seededRandom(groupSeed) - 0.5) * spread;
		const groupZ = (seededRandom(groupSeed + 1) - 0.5) * spread;

		// Check distance from all islands
		let tooClose = false;
		for (const island of islands) {
			const dx = groupX - island.position[0];
			const dz = groupZ - island.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < minDistFromIsland) {
				tooClose = true;
				break;
			}
		}

		if (tooClose) continue;

		// 1-4 rocks per group
		const rockCount = 1 + Math.floor(seededRandom(groupSeed + 2) * 4);

		for (let r = 0; r < rockCount; r++) {
			const rockSeed = groupSeed + r * 100;

			const offsetDist = r === 0 ? 0 : 1.2 + seededRandom(rockSeed) * 1.0;
			const offsetAngle = seededRandom(rockSeed + 1) * Math.PI * 2;
			const localX = Math.cos(offsetAngle) * offsetDist;
			const localZ = Math.sin(offsetAngle) * offsetDist;

			const sizeMultiplier = r === 0 ? 1 : 0.4 + seededRandom(rockSeed + 2) * 0.5;
			const baseScale = (0.25 + seededRandom(rockSeed + 3) * 0.55) * sizeMultiplier;

			colliders.push({
				position: [groupX + localX, groupZ + localZ],
				radius: baseScale * 2.0, // Larger hitbox for gameplay
			});
		}
	}

	return colliders;
}

// Simple 2D circle collision check
// Returns push vector if colliding
function checkCircle(
	x: number,
	z: number,
	centerX: number,
	centerZ: number,
	radius: number,
	boatRadius: number,
): { pushX: number; pushZ: number } | null {
	const dx = x - centerX;
	const dz = z - centerZ;
	const distSq = dx * dx + dz * dz;
	const minDist = radius + boatRadius;

	if (distSq < minDist * minDist && distSq > 0) {
		const dist = Math.sqrt(distSq);
		const overlap = minDist - dist;
		const pushStrength = overlap * 0.15;
		return {
			pushX: (dx / dist) * pushStrength,
			pushZ: (dz / dist) * pushStrength,
		};
	}
	return null;
}

// Check if a position collides with any island (main body + lobes)
// Uses precomputed collision data from IslandData
export function checkIslandCollision(
	x: number,
	z: number,
	islands: IslandData[],
	boatRadius: number = 1.0,
): { collides: boolean; pushX: number; pushZ: number } {
	let totalPushX = 0;
	let totalPushZ = 0;
	let collides = false;

	for (const island of islands) {
		const [ix, , iz] = island.position;

		// Main island - uses precomputed collisionRadius
		const mainPush = checkCircle(x, z, ix, iz, island.collisionRadius, boatRadius);
		if (mainPush) {
			collides = true;
			totalPushX += mainPush.pushX;
			totalPushZ += mainPush.pushZ;
		}

		// Lobes - use precomputed worldX, worldZ, collisionRadius
		for (const lobe of island.lobes) {
			const lobePush = checkCircle(
				x,
				z,
				lobe.worldX,
				lobe.worldZ,
				lobe.collisionRadius,
				boatRadius,
			);
			if (lobePush) {
				collides = true;
				totalPushX += lobePush.pushX;
				totalPushZ += lobePush.pushZ;
			}
		}
	}

	return { collides, pushX: totalPushX, pushZ: totalPushZ };
}

// Check if a position collides with any rock
// Returns gentle push force to repel boat away
export function checkRockCollision(
	x: number,
	z: number,
	rocks: RockCollider[],
	boatRadius: number = 1.0,
): { collides: boolean; pushX: number; pushZ: number } {
	let totalPushX = 0;
	let totalPushZ = 0;
	let collides = false;

	for (const rock of rocks) {
		const dx = x - rock.position[0];
		const dz = z - rock.position[1];
		const dist = Math.sqrt(dx * dx + dz * dz);

		const minDist = rock.radius + boatRadius;

		if (dist < minDist && dist > 0) {
			collides = true;
			const overlap = minDist - dist;
			const pushStrength = overlap * 0.2;
			const nx = dx / dist;
			const nz = dz / dist;
			totalPushX += nx * pushStrength;
			totalPushZ += nz * pushStrength;
		}
	}

	return { collides, pushX: totalPushX, pushZ: totalPushZ };
}

// Check ship-to-ship collision
// Used for AI ships colliding with player and other AI ships
export function checkShipCollision(
	x: number,
	z: number,
	shipRadius: number,
	playerPosition: [number, number, number],
	playerRadius: number,
	otherShips: OtherPlayer[],
	excludeId?: string,
): { collides: boolean; pushX: number; pushZ: number } {
	let totalPushX = 0;
	let totalPushZ = 0;
	let collides = false;

	// Check collision with player
	const dxPlayer = x - playerPosition[0];
	const dzPlayer = z - playerPosition[2];
	const distPlayer = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);
	const minDistPlayer = shipRadius + playerRadius;

	if (distPlayer < minDistPlayer && distPlayer > 0) {
		collides = true;
		const overlap = minDistPlayer - distPlayer;
		const pushStrength = overlap * 0.2;
		totalPushX += (dxPlayer / distPlayer) * pushStrength;
		totalPushZ += (dzPlayer / distPlayer) * pushStrength;
	}

	// Check collision with other AI ships
	for (const ship of otherShips) {
		if (ship.id === excludeId) continue;

		const dx = x - ship.position[0];
		const dz = z - ship.position[2];
		const dist = Math.sqrt(dx * dx + dz * dz);
		const minDist = shipRadius * 2; // Both ships have same radius

		if (dist < minDist && dist > 0) {
			collides = true;
			const overlap = minDist - dist;
			const pushStrength = overlap * 0.15;
			totalPushX += (dx / dist) * pushStrength;
			totalPushZ += (dz / dist) * pushStrength;
		}
	}

	return { collides, pushX: totalPushX, pushZ: totalPushZ };
}
