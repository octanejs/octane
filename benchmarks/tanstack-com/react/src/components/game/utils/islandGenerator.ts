// Procedural island generation for TanStack libraries
import type { LibrarySlim } from '~/libraries/types';

export interface IslandLobe {
	offsetX: number;
	offsetZ: number;
	scale: number; // Relative to main island scale
	// Precomputed world-space collision data
	worldX: number;
	worldZ: number;
	collisionRadius: number;
}

// Slim partner data for the game (avoids importing full partners with images)
export interface PartnerSlim {
	id: string;
	name: string;
	href: string;
	brandColor?: string;
	logoLight?: string; // Logo for dark backgrounds (white/light version)
	logoDark?: string; // Logo for light backgrounds (dark version)
	tagline?: string; // Short tagline for info card
}

// Slim showcase data for the game
export interface ShowcaseSlim {
	id: string;
	name: string;
	url: string;
	screenshotUrl: string;
	tagline: string;
}

export interface IslandData {
	id: string;
	type: 'library' | 'partner' | 'showcase';
	position: [number, number, number];
	rotation: number;
	scale: number;
	library?: LibrarySlim;
	partner?: PartnerSlim;
	showcase?: ShowcaseSlim;
	palmCount: number;
	hasCoconuts: boolean;
	hasTikiShack: boolean;
	elongation: number;
	bumpiness: number;
	lobes: IslandLobe[]; // Additional spherical caps that make up the island
	collisionRadius: number; // Precomputed main island collision radius
}

// Seeded random for consistent generation
function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

// Popularity/size ranking (0-1 scale, higher = bigger island)
// Based on npm downloads and community usage
const LIBRARY_POPULARITY: Record<string, number> = {
	query: 1.0, // Most popular - millions of weekly downloads
	table: 0.85, // Very popular
	router: 0.75, // Growing fast
	virtual: 0.6, // Solid usage
	form: 0.5, // Newer but growing
	start: 0.45, // New framework
	store: 0.3, // Core utility
	db: 0.35, // New
	ai: 0.3, // New
	pacer: 0.25, // New utility
	ranger: 0.2, // Niche
	config: 0.2, // Tooling
	devtools: 0.25, // Tooling
};

const INNER_RADIUS = 20;
const OUTER_RADIUS = 70;
const MIN_ISLAND_DISTANCE = 14;

// World boundary - square bounds for the playable area
export const WORLD_BOUNDARY = 85;

export function generateIslands(libraries: LibrarySlim[]): IslandData[] {
	// Filter to only libraries with pages (have a `to` property)
	const validLibraries = libraries.filter((lib) => lib.to);

	const islands: IslandData[] = [];
	const positions: [number, number][] = [];

	validLibraries.forEach((library, index) => {
		const seed = index * 12345;

		// Distribute islands in a spiral pattern with some randomness
		const baseAngle = (index / validLibraries.length) * Math.PI * 2;
		const angleOffset = (seededRandom(seed) - 0.5) * 0.4;
		const angle = baseAngle + angleOffset;

		// Vary radius based on index to create spiral effect
		const radiusVariation = seededRandom(seed + 1);
		const radius = INNER_RADIUS + radiusVariation * (OUTER_RADIUS - INNER_RADIUS);

		let x = Math.cos(angle) * radius;
		let z = Math.sin(angle) * radius;

		// Push islands apart if too close
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < MIN_ISLAND_DISTANCE) {
				const pushStrength = (MIN_ISLAND_DISTANCE - dist) / dist;
				x += dx * pushStrength * 0.5;
				z += dz * pushStrength * 0.5;
			}
		}

		positions.push([x, z]);

		// Visual variation - scale based on popularity with some randomness
		const popularity = LIBRARY_POPULARITY[library.id] ?? 0.3;
		const baseScale = 0.6 + popularity * 0.6; // 0.6 to 1.2 based on popularity
		const scale = baseScale + (seededRandom(seed + 2) - 0.5) * 0.15; // ±0.075 random variation
		const rotation = seededRandom(seed + 3) * Math.PI * 2;
		const palmCount = 3 + Math.floor(seededRandom(seed + 4) * 4); // 3-6 palm trees
		const hasCoconuts = seededRandom(seed + 5) > 0.6; // 40% chance of coconuts
		const hasTikiShack = popularity >= 0.7; // Only on larger/popular islands
		const elongation = 0.8 + seededRandom(seed + 7) * 0.4; // 0.8-1.2 elongation
		const bumpiness = 0.3 + seededRandom(seed + 8) * 0.7; // 0.3-1.0 bumpiness

		// Generate lobes (additional spherical caps) for organic shape
		// 0-2 additional lobes based on randomness
		const lobeCount = Math.floor(seededRandom(seed + 9) * 3); // 0, 1, or 2
		const lobes: IslandLobe[] = [];
		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		for (let i = 0; i < lobeCount; i++) {
			const lobeSeed = seed + 100 + i * 10;
			const angle = seededRandom(lobeSeed) * Math.PI * 2;
			const distance = 1.5 + seededRandom(lobeSeed + 1) * 1.0; // Distance from center
			const lobeScale = 0.5 + seededRandom(lobeSeed + 2) * 0.4; // 50-90% of main scale
			const offsetX = Math.cos(angle) * distance;
			const offsetZ = Math.sin(angle) * distance;
			// Apply island rotation to get world-space offset
			// THREE.js Y rotation (right-hand rule, Y up): x' = x*cos + z*sin, z' = -x*sin + z*cos
			const rotatedX = (offsetX * cosR + offsetZ * sinR) * scale;
			const rotatedZ = (-offsetX * sinR + offsetZ * cosR) * scale;
			lobes.push({
				offsetX,
				offsetZ,
				scale: lobeScale,
				// Precomputed world-space collision data (with rotation applied)
				worldX: x + rotatedX,
				worldZ: z + rotatedZ,
				collisionRadius: 3.0 * elongation * lobeScale * scale,
			});
		}

		// Main island collision radius
		const collisionRadius = 3.0 * elongation * scale;

		islands.push({
			id: library.id,
			type: 'library',
			position: [x, 0, z],
			rotation,
			scale,
			library,
			palmCount,
			hasCoconuts,
			hasTikiShack,
			elongation,
			bumpiness,
			lobes,
			collisionRadius,
		});
	});

	return islands;
}

// Corner boss islands - 4 mysterious islands in the corners guarded by boss AIs
const CORNER_POSITIONS: Array<[number, number]> = [
	[480, 480], // NE
	[-480, 480], // NW
	[-480, -480], // SW
	[480, -480], // SE
];

const CORNER_ISLAND_NAMES = ['Skull Island', 'Shadow Reef', 'Dread Harbor', 'Cursed Atoll'];

export function generateCornerIslands(): IslandData[] {
	const islands: IslandData[] = [];

	CORNER_POSITIONS.forEach(([x, z], index) => {
		const seed = (index + 500) * 13579;

		// Corner islands are small but imposing
		const scale = 0.7 + seededRandom(seed + 2) * 0.2; // 0.7 to 0.9
		const rotation = seededRandom(seed + 3) * Math.PI * 2;
		const palmCount = 2 + Math.floor(seededRandom(seed + 4) * 3); // 2-4 palm trees
		const hasCoconuts = false; // No coconuts on cursed islands
		const hasTikiShack = false; // No tiki shacks
		const elongation = 0.9 + seededRandom(seed + 7) * 0.2;
		const bumpiness = 0.7 + seededRandom(seed + 8) * 0.3; // More rugged

		// Single lobe for corner islands
		const lobes: IslandLobe[] = [];
		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		const lobeSeed = seed + 100;
		const lobeAngle = seededRandom(lobeSeed) * Math.PI * 2;
		const distance = 1.5 + seededRandom(lobeSeed + 1) * 0.8;
		const lobeScale = 0.5 + seededRandom(lobeSeed + 2) * 0.3;
		const offsetX = Math.cos(lobeAngle) * distance;
		const offsetZ = Math.sin(lobeAngle) * distance;
		const rotatedX = (offsetX * cosR + offsetZ * sinR) * scale;
		const rotatedZ = (-offsetX * sinR + offsetZ * cosR) * scale;
		lobes.push({
			offsetX,
			offsetZ,
			scale: lobeScale,
			worldX: x + rotatedX,
			worldZ: z + rotatedZ,
			collisionRadius: 3.0 * elongation * lobeScale * scale,
		});

		const collisionRadius = 3.0 * elongation * scale;

		islands.push({
			id: `corner-${index}`,
			type: 'showcase', // Reuse showcase type for rendering (purple)
			position: [x, 0, z],
			rotation,
			scale,
			showcase: {
				id: `corner-${index}`,
				name: CORNER_ISLAND_NAMES[index],
				url: '', // No URL for corner islands
				screenshotUrl: '',
				tagline: 'A mysterious island guarded by a fearsome captain',
			},
			palmCount,
			hasCoconuts,
			hasTikiShack,
			elongation,
			bumpiness,
			lobes,
			collisionRadius,
		});
	});

	return islands;
}

// Get distance between boat and island
export function getIslandDistance(
	boatPos: [number, number, number],
	islandPos: [number, number, number],
): number {
	const dx = boatPos[0] - islandPos[0];
	const dz = boatPos[2] - islandPos[2];
	return Math.sqrt(dx * dx + dz * dz);
}

// Find the nearest island within interaction range
export function findNearestIsland(
	boatPos: [number, number, number],
	islands: IslandData[],
	maxDistance: number = 8,
): IslandData | null {
	let nearest: IslandData | null = null;
	let nearestDist = maxDistance;

	for (const island of islands) {
		const dist = getIslandDistance(boatPos, island.position);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearest = island;
		}
	}

	return nearest;
}

// Generate expanded zone islands for partners (placed in outer ring after upgrade)
const EXPANDED_INNER_RADIUS = 100; // Just outside the initial world boundary
const EXPANDED_OUTER_RADIUS = 170;

export function generateExpandedIslands(partners: PartnerSlim[]): IslandData[] {
	const islands: IslandData[] = [];
	const positions: [number, number][] = [];

	partners.forEach((partner, index) => {
		const seed = (index + 100) * 54321;

		// Distribute in a ring around the expanded zone
		const baseAngle = (index / partners.length) * Math.PI * 2;
		const angleOffset = (seededRandom(seed) - 0.5) * 0.3;
		const angle = baseAngle + angleOffset;

		const radiusVariation = seededRandom(seed + 1);
		const radius =
			EXPANDED_INNER_RADIUS + radiusVariation * (EXPANDED_OUTER_RADIUS - EXPANDED_INNER_RADIUS);

		let x = Math.cos(angle) * radius;
		let z = Math.sin(angle) * radius;

		// Push islands apart if too close
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < MIN_ISLAND_DISTANCE * 1.5) {
				const pushStrength = (MIN_ISLAND_DISTANCE * 1.5 - dist) / dist;
				x += dx * pushStrength * 0.5;
				z += dz * pushStrength * 0.5;
			}
		}

		positions.push([x, z]);

		// Partner islands are larger and more impressive
		const scale = 0.9 + seededRandom(seed + 2) * 0.4; // 0.9 to 1.3
		const rotation = seededRandom(seed + 3) * Math.PI * 2;
		const palmCount = 4 + Math.floor(seededRandom(seed + 4) * 5); // 4-8 palm trees
		const hasCoconuts = seededRandom(seed + 5) > 0.4;
		const hasTikiShack = true; // All partner islands have tiki shacks
		const elongation = 0.9 + seededRandom(seed + 7) * 0.3;
		const bumpiness = 0.4 + seededRandom(seed + 8) * 0.6;

		// More lobes for partner islands
		const lobeCount = 1 + Math.floor(seededRandom(seed + 9) * 2); // 1-2 lobes
		const lobes: IslandLobe[] = [];
		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		for (let i = 0; i < lobeCount; i++) {
			const lobeSeed = seed + 100 + i * 10;
			const lobeAngle = seededRandom(lobeSeed) * Math.PI * 2;
			const distance = 1.8 + seededRandom(lobeSeed + 1) * 1.2;
			const lobeScale = 0.55 + seededRandom(lobeSeed + 2) * 0.35;
			const offsetX = Math.cos(lobeAngle) * distance;
			const offsetZ = Math.sin(lobeAngle) * distance;
			// Apply island rotation to get world-space offset
			// THREE.js Y rotation (right-hand rule, Y up): x' = x*cos + z*sin, z' = -x*sin + z*cos
			const rotatedX = (offsetX * cosR + offsetZ * sinR) * scale;
			const rotatedZ = (-offsetX * sinR + offsetZ * cosR) * scale;
			lobes.push({
				offsetX,
				offsetZ,
				scale: lobeScale,
				// Precomputed world-space collision data (with rotation applied)
				worldX: x + rotatedX,
				worldZ: z + rotatedZ,
				collisionRadius: 3.0 * elongation * lobeScale * scale,
			});
		}

		// Main island collision radius
		const collisionRadius = 3.0 * elongation * scale;

		islands.push({
			id: `partner-${partner.id}`,
			type: 'partner',
			position: [x, 0, z],
			rotation,
			scale,
			partner,
			palmCount,
			hasCoconuts,
			hasTikiShack,
			elongation,
			bumpiness,
			lobes,
			collisionRadius,
		});
	});

	return islands;
}

// Generate showcase islands (placed in outer ring beyond partner islands)
const SHOWCASE_INNER_RADIUS = 280; // Far beyond partner islands
const SHOWCASE_OUTER_RADIUS = 450;

export function generateShowcaseIslands(showcases: ShowcaseSlim[]): IslandData[] {
	const islands: IslandData[] = [];
	const positions: [number, number][] = [];

	showcases.forEach((showcase, index) => {
		const seed = (index + 200) * 98765;

		// Distribute in a ring around the outer zone with more variability
		const baseAngle = (index / showcases.length) * Math.PI * 2;
		const angleOffset = (seededRandom(seed) - 0.5) * 0.6; // More angle variation
		const angle = baseAngle + angleOffset;

		// More variability in distance (full range from inner to outer)
		const radiusVariation = seededRandom(seed + 1);
		// Use a curve to spread islands more evenly across the range
		const curvedVariation = Math.pow(radiusVariation, 0.7);
		const radius =
			SHOWCASE_INNER_RADIUS + curvedVariation * (SHOWCASE_OUTER_RADIUS - SHOWCASE_INNER_RADIUS);

		let x = Math.cos(angle) * radius;
		let z = Math.sin(angle) * radius;

		// Push islands apart if too close
		for (const [px, pz] of positions) {
			const dx = x - px;
			const dz = z - pz;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < MIN_ISLAND_DISTANCE * 2) {
				const pushStrength = (MIN_ISLAND_DISTANCE * 2 - dist) / dist;
				x += dx * pushStrength * 0.5;
				z += dz * pushStrength * 0.5;
			}
		}

		positions.push([x, z]);

		// Showcase islands are impressive and distinct
		const scale = 1.0 + seededRandom(seed + 2) * 0.5; // 1.0 to 1.5
		const rotation = seededRandom(seed + 3) * Math.PI * 2;
		const palmCount = 5 + Math.floor(seededRandom(seed + 4) * 6); // 5-10 palm trees
		const hasCoconuts = seededRandom(seed + 5) > 0.3;
		const hasTikiShack = true; // All showcase islands have tiki shacks
		const elongation = 0.85 + seededRandom(seed + 7) * 0.35;
		const bumpiness = 0.5 + seededRandom(seed + 8) * 0.5;

		// More lobes for showcase islands (2-3)
		const lobeCount = 2 + Math.floor(seededRandom(seed + 9) * 2);
		const lobes: IslandLobe[] = [];
		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		for (let i = 0; i < lobeCount; i++) {
			const lobeSeed = seed + 100 + i * 10;
			const lobeAngle = seededRandom(lobeSeed) * Math.PI * 2;
			const distance = 2.0 + seededRandom(lobeSeed + 1) * 1.5;
			const lobeScale = 0.6 + seededRandom(lobeSeed + 2) * 0.35;
			const offsetX = Math.cos(lobeAngle) * distance;
			const offsetZ = Math.sin(lobeAngle) * distance;
			const rotatedX = (offsetX * cosR + offsetZ * sinR) * scale;
			const rotatedZ = (-offsetX * sinR + offsetZ * cosR) * scale;
			lobes.push({
				offsetX,
				offsetZ,
				scale: lobeScale,
				worldX: x + rotatedX,
				worldZ: z + rotatedZ,
				collisionRadius: 3.0 * elongation * lobeScale * scale,
			});
		}

		const collisionRadius = 3.0 * elongation * scale;

		islands.push({
			id: `showcase-${showcase.id}`,
			type: 'showcase',
			position: [x, 0, z],
			rotation,
			scale,
			showcase,
			palmCount,
			hasCoconuts,
			hasTikiShack,
			elongation,
			bumpiness,
			lobes,
			collisionRadius,
		});
	});

	return islands;
}
