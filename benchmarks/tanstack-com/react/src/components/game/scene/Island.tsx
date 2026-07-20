import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS, getLibraryColor } from '../utils/colors';
import type { IslandData } from '../utils/islandGenerator';
import { PalmTree } from './PalmTree';
import { BeachChair } from './BeachChair';
import { TikiShack } from './TikiShack';
import { Flag } from './Flag';
import { IslandLobe } from './IslandLobe';

interface IslandProps {
	data: IslandData;
	isDiscovered: boolean;
}

function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

export function Island({ data, isDiscovered }: IslandProps) {
	const {
		position,
		rotation,
		scale,
		library,
		partner,
		palmCount,
		hasCoconuts,
		hasTikiShack,
		elongation,
		lobes,
	} = data;

	// Get color based on island type
	const libraryColor =
		data.type === 'library' && library
			? getLibraryColor(library.id)
			: data.type === 'partner' && partner?.brandColor
				? partner.brandColor
				: data.type === 'partner'
					? '#f59e0b' // Fallback amber for partners without brandColor
					: '#8b5cf6'; // Purple for showcase

	// Get ID for seeding
	const seedId = library?.id ?? partner?.id ?? data.id;

	// Sphere radius - island is top 5% of this sphere
	const sphereRadius = 8;
	const islandRadius = 2.2 * elongation;

	// Height where sphere surface meets the water
	const surfaceHeight = Math.sqrt(sphereRadius * sphereRadius - islandRadius * islandRadius);
	const sphereCenterY = -surfaceHeight + 0.3; // Slight offset above water

	// Generate consistent layout - objects sit on top of sphere
	const layout = useMemo(() => {
		const seed = seedId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

		// Helper to get Y position on sphere surface given x,z
		const getHeightOnSphere = (x: number, z: number) => {
			const distFromCenter = Math.sqrt(x * x + z * z);
			if (distFromCenter >= sphereRadius) return 0;
			return (
				Math.sqrt(sphereRadius * sphereRadius - distFromCenter * distFromCenter) + sphereCenterY
			);
		};

		// Flag exclusion zone - flag is at +X, +Z diagonal (45 degrees)
		// We need to check in LOCAL space after accounting for island rotation
		const _flagAngle = Math.PI * 0.25; // 45 degrees
		const flagRadius = 1.8;
		const flagExclusionRadius = 0.6; // Smaller exclusion for flag pole vs old sign

		// Check if a local position is too close to where the flag will be
		// Flag is placed in world space at fixed angle, so we need to
		// transform local coords to check against flag position
		const isNearFlag = (localX: number, localZ: number) => {
			// The flag is placed at world +X, +Z regardless of island rotation
			// So in local space, we need to rotate backwards by island rotation
			const cosR = Math.cos(-rotation);
			const sinR = Math.sin(-rotation);
			const flagLocalX = flagRadius * 0.707 * cosR + flagRadius * 0.707 * sinR;
			const flagLocalZ = -flagRadius * 0.707 * sinR + flagRadius * 0.707 * cosR;

			const dx = localX - flagLocalX;
			const dz = localZ - flagLocalZ;
			return Math.sqrt(dx * dx + dz * dz) < flagExclusionRadius;
		};

		// Palm tree positions - avoid sign zone
		const palmTints = ['#AAFFAA', '#CCFFCC', '#88FF88', '#BBFFBB', '#99FF99'];
		const palmPositions: Array<{
			pos: [number, number, number];
			scale: number;
			hasCoconuts: boolean;
			tint: string;
		}> = [];
		for (let i = 0; i < palmCount; i++) {
			let attempts = 0;
			let x: number, z: number, angle: number, radius: number;

			// Try to find a position not near the sign
			do {
				angle = seededRandom(seed + i * 100 + attempts * 7) * Math.PI * 2;
				radius = 0.5 + seededRandom(seed + i * 101 + attempts * 7) * 1.2;
				x = Math.cos(angle) * radius;
				z = Math.sin(angle) * radius;
				attempts++;
			} while (isNearFlag(x, z) && attempts < 10);

			const y = getHeightOnSphere(x, z);
			const tintIndex = Math.floor(seededRandom(seed + i * 103) * palmTints.length);
			palmPositions.push({
				pos: [x, y, z],
				scale: 0.5 + seededRandom(seed + i * 102) * 0.3,
				hasCoconuts: i === 0 && hasCoconuts,
				tint: palmTints[tintIndex],
			});
		}

		// Beach chair position - on the sand ring, avoid sign zone
		let chairAngle = seededRandom(seed + 200) * Math.PI * 2;
		const chairRadius = 2.0 + seededRandom(seed + 201) * 0.5;
		let chairX = Math.cos(chairAngle) * chairRadius;
		let chairZ = Math.sin(chairAngle) * chairRadius;

		// If chair is near sign, move it to opposite side
		if (isNearFlag(chairX, chairZ)) {
			chairAngle += Math.PI; // Flip to opposite side
			chairX = Math.cos(chairAngle) * chairRadius;
			chairZ = Math.sin(chairAngle) * chairRadius;
		}

		const chairPos: [number, number, number] = [chairX, getHeightOnSphere(chairX, chairZ), chairZ];
		const chairRotation = chairAngle + Math.PI * 0.8;

		// Sign position - computed in local island space
		// Will be transformed to world space separately
		const signLocalRadius = 1.6;
		const signLocalX = signLocalRadius;
		const signLocalZ = signLocalRadius;
		const signLocalY = getHeightOnSphere(signLocalX, signLocalZ);

		// Tiki shack near center (center is always safe from sign)
		const shackX = (seededRandom(seed + 400) - 0.5) * 0.8;
		const shackZ = (seededRandom(seed + 401) - 0.5) * 0.8;
		const shackPos: [number, number, number] = [shackX, getHeightOnSphere(shackX, shackZ), shackZ];
		const shackRotation = seededRandom(seed + 402) * Math.PI * 2;

		return {
			palmPositions,
			chairPos,
			chairRotation,
			signLocalX,
			signLocalZ,
			signLocalY,
			shackPos,
			shackRotation,
			getHeightOnSphere,
			isNearFlag,
		};
	}, [seedId, palmCount, hasCoconuts, sphereRadius, sphereCenterY, rotation]);

	// Compute sign world position - always on +X, +Z side (toward camera)
	// This is independent of island rotation
	const signWorldPos: [number, number, number] = (() => {
		const signRadius = 1.8;
		// Fixed direction toward camera (+X, +Z diagonal)
		const signOffsetX = signRadius * 0.707; // cos(45°)
		const signOffsetZ = signRadius * 0.707; // sin(45°)
		// Get height on sphere at this position (need to account for island rotation for height only)
		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		// Convert world offset back to local (unscaled) for height calculation
		const localX = signOffsetX * cosR + signOffsetZ * sinR;
		const localZ = -signOffsetX * sinR + signOffsetZ * cosR;
		const localY = layout.getHeightOnSphere(localX, localZ);
		return [
			position[0] + signOffsetX * scale,
			position[1] + localY * scale + 0.1, // small lift
			position[2] + signOffsetZ * scale,
		];
	})();

	// Create spherical cap geometry with vertex colors for foam → sand → grass gradient
	const { islandGeometry, rockPositions, shrubPositions, grassTufts } = useMemo(() => {
		const seed = seedId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

		// Flag exclusion - compute flag local position for this island's rotation
		const flagRadiusLocal = 1.8;
		const flagExclusionRadiusLocal = 0.5; // Smaller for flag pole
		const cosR = Math.cos(-rotation);
		const sinR = Math.sin(-rotation);
		const flagLocalXCalc = flagRadiusLocal * 0.707 * cosR + flagRadiusLocal * 0.707 * sinR;
		const flagLocalZCalc = -flagRadiusLocal * 0.707 * sinR + flagRadiusLocal * 0.707 * cosR;

		const isNearFlagLocal = (x: number, z: number) => {
			const dx = x - flagLocalXCalc;
			const dz = z - flagLocalZCalc;
			return Math.sqrt(dx * dx + dz * dz) < flagExclusionRadiusLocal;
		};
		// Extend sphere cap further down to include underwater portion
		const geo = new THREE.SphereGeometry(
			sphereRadius,
			48,
			32,
			0,
			Math.PI * 2,
			0,
			Math.PI * 0.25, // Larger cap to extend below waterline
		);

		const posAttr = geo.attributes.position;
		const colors: number[] = [];

		// Define color zones
		const foamColor = new THREE.Color('#E8F4F8'); // Light foam/white
		const shallowColor = new THREE.Color(COLORS.ocean.shallow); // Turquoise underwater
		const sandColorLight = new THREE.Color(COLORS.sand.light);
		const sandColorMid = new THREE.Color(COLORS.sand.mid);
		const grassColorDark = new THREE.Color('#1B5E20');
		const grassColorLight = new THREE.Color('#2E7D32');

		// Water level adapts to elongation - larger islands need higher foam threshold
		// elongation ~1.0 = small island, ~1.3 = large island
		const _waterLevel = 0.38 + (elongation - 1.0) * 0.25;

		// Add irregularity to shoreline and color variation
		for (let i = 0; i < posAttr.count; i++) {
			const x = posAttr.getX(i);
			const y = posAttr.getY(i);
			const z = posAttr.getZ(i);

			// Add noise to edge vertices for irregular shoreline
			const angle = Math.atan2(z, x);
			const distFromCenter = Math.sqrt(x * x + z * z);
			const edgeNoise =
				Math.sin(angle * 5 + seed) * 0.15 +
				Math.sin(angle * 9 + seed * 2) * 0.08 +
				Math.sin(angle * 13 + seed * 3) * 0.04;

			// Normalized Y: 0 = bottom of cap (underwater), 1 = top center
			const normalizedY = (y - sphereRadius * 0.75) / (sphereRadius * 0.25);

			// Apply irregular edge to shoreline area
			if (normalizedY < 0.5 && normalizedY > 0.1 && distFromCenter > 1) {
				const noiseAmount = (0.5 - Math.abs(normalizedY - 0.3)) * 0.4;
				posAttr.setX(i, x + (x / distFromCenter) * edgeNoise * noiseAmount * distFromCenter * 0.12);
				posAttr.setZ(i, z + (z / distFromCenter) * edgeNoise * noiseAmount * distFromCenter * 0.12);
			}

			// Absolute Y height for consistent coloring across all spheres
			const absoluteY = y + sphereCenterY;

			// Color noise for texture variation
			const colorNoise = Math.sin(angle * 7 + seed) * 0.5 + 0.5;

			// Fixed height thresholds (absolute Y coordinates)
			// Vertex Y ranges roughly from -1.5 (underwater edge) to 0.7 (top center)
			const waterY = -0.6;
			const foamY = -0.35;
			const sandY = -0.25;
			const grassY = 0.0;

			let color: THREE.Color;

			if (absoluteY < waterY) {
				// Underwater - shallow turquoise
				color = shallowColor.clone();
				color.lerp(new THREE.Color('#1A8A9A'), colorNoise * 0.2);
			} else if (absoluteY < foamY) {
				// Foam zone - white/light blue transition
				const foamAmount = THREE.MathUtils.smoothstep(absoluteY, waterY, foamY);
				color = shallowColor.clone().lerp(foamColor, foamAmount);
				// Add sparkle to foam
				color.lerp(new THREE.Color('#FFFFFF'), colorNoise * 0.3 * foamAmount);
			} else if (absoluteY < sandY) {
				// Sand zone
				const sandProgress = THREE.MathUtils.smoothstep(absoluteY, foamY, sandY);
				// Wet sand near water, dry sand higher up
				const wetSand = sandColorLight.clone().lerp(foamColor, 0.15);
				color = wetSand.clone().lerp(sandColorMid, sandProgress);
				color.lerp(sandColorMid.clone().multiplyScalar(0.95), colorNoise * 0.15);
			} else {
				// Grass zone
				const grassProgress = THREE.MathUtils.smoothstep(absoluteY, sandY, grassY);
				// Position-based noise for natural grass variation (not angle-based)
				const grassNoise = Math.sin(x * 3.7 + seed) * Math.cos(z * 4.1 + seed * 1.3) * 0.5 + 0.5;
				// Solid base grass with subtle noise variation
				const baseGrass = grassColorDark.clone().lerp(grassColorLight, 0.3);
				const grassColor = baseGrass.clone().lerp(grassColorDark, grassNoise * 0.25);
				color = sandColorMid.clone().lerp(grassColor, grassProgress);
			}

			colors.push(color.r, color.g, color.b);
		}

		geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geo.computeVertexNormals();

		// Generate rock positions for micro props - avoid sign zone
		const rocks: Array<{
			pos: [number, number, number];
			scale: number;
			rotation: number;
		}> = [];
		const numRocks = 2 + Math.floor(seededRandom(seed + 500) * 3);
		for (let i = 0; i < numRocks; i++) {
			let attempts = 0;
			let rx: number, rz: number, rockAngle: number, rockRadius: number;

			do {
				rockAngle = seededRandom(seed + 600 + i * 10 + attempts * 7) * Math.PI * 2;
				rockRadius = 1.8 + seededRandom(seed + 601 + i * 10 + attempts * 7) * 0.6;
				rx = Math.cos(rockAngle) * rockRadius;
				rz = Math.sin(rockAngle) * rockRadius;
				attempts++;
			} while (isNearFlagLocal(rx, rz) && attempts < 10);

			const ry =
				Math.sqrt(Math.max(0, sphereRadius * sphereRadius - rx * rx - rz * rz)) +
				sphereCenterY -
				0.05;
			rocks.push({
				pos: [rx, ry, rz],
				scale: 0.1 + seededRandom(seed + 602 + i * 10) * 0.15,
				rotation: seededRandom(seed + 603 + i * 10) * Math.PI * 2,
			});
		}

		// Generate shrub/bush positions on grass area - avoid sign zone
		const shrubs: Array<{
			pos: [number, number, number];
			scale: number;
			color: string;
		}> = [];
		const shrubColors = ['#2D5A27', '#3D7A37', '#1E4620', '#4A8B44', '#2E6B28'];
		const numShrubs = 4 + Math.floor(seededRandom(seed + 700) * 5);
		for (let i = 0; i < numShrubs; i++) {
			let attempts = 0;
			let sx: number, sz: number, shrubAngle: number, shrubRadius: number;

			do {
				shrubAngle = seededRandom(seed + 800 + i * 10 + attempts * 7) * Math.PI * 2;
				shrubRadius = 0.3 + seededRandom(seed + 801 + i * 10 + attempts * 7) * 1.0;
				sx = Math.cos(shrubAngle) * shrubRadius;
				sz = Math.sin(shrubAngle) * shrubRadius;
				attempts++;
			} while (isNearFlagLocal(sx, sz) && attempts < 10);

			const sy =
				Math.sqrt(Math.max(0, sphereRadius * sphereRadius - sx * sx - sz * sz)) + sphereCenterY;
			shrubs.push({
				pos: [sx, sy, sz],
				scale: 0.08 + seededRandom(seed + 802 + i * 10) * 0.12,
				color: shrubColors[Math.floor(seededRandom(seed + 803 + i * 10) * shrubColors.length)],
			});
		}

		// Generate grass tuft / flower positions - avoid sign zone
		const grassTufts: Array<{
			pos: [number, number, number];
			scale: number;
			color: string;
		}> = [];
		const grassColors = ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7'];
		const flowerColors = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#FFFFFF'];
		const numTufts = 6 + Math.floor(seededRandom(seed + 900) * 6);
		for (let i = 0; i < numTufts; i++) {
			let attempts = 0;
			let tx: number, tz: number, tuftAngle: number, tuftRadius: number;

			do {
				tuftAngle = seededRandom(seed + 950 + i * 10 + attempts * 7) * Math.PI * 2;
				tuftRadius = 0.4 + seededRandom(seed + 951 + i * 10 + attempts * 7) * 1.3;
				tx = Math.cos(tuftAngle) * tuftRadius;
				tz = Math.sin(tuftAngle) * tuftRadius;
				attempts++;
			} while (isNearFlagLocal(tx, tz) && attempts < 10);

			const ty =
				Math.sqrt(Math.max(0, sphereRadius * sphereRadius - tx * tx - tz * tz)) + sphereCenterY;
			const isFlower = seededRandom(seed + 952 + i * 10) > 0.6;
			grassTufts.push({
				pos: [tx, ty, tz],
				scale: 0.03 + seededRandom(seed + 953 + i * 10) * 0.04,
				color: isFlower
					? flowerColors[Math.floor(seededRandom(seed + 954 + i * 10) * flowerColors.length)]
					: grassColors[Math.floor(seededRandom(seed + 954 + i * 10) * grassColors.length)],
			});
		}

		return {
			islandGeometry: geo,
			rockPositions: rocks,
			shrubPositions: shrubs,
			grassTufts,
		};
	}, [sphereRadius, seedId, sphereCenterY, elongation, rotation]);

	const seed = seedId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

	return (
		<>
			<group position={position} rotation={[0, rotation, 0]} scale={scale}>
				{/* Soft foam edge - gradient ring */}
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
					<ringGeometry args={[islandRadius * 0.97, islandRadius * 1.03, 64]} />
					<meshStandardMaterial color="#FFFFFF" transparent opacity={0.6} />
				</mesh>

				{/* Shallow water ring - turquoise */}
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
					<ringGeometry args={[islandRadius * 1.0, islandRadius * 1.25, 64]} />
					<meshStandardMaterial color={COLORS.ocean.shallow} transparent opacity={0.5} />
				</mesh>

				{/* Island - spherical cap with gradient */}
				<mesh geometry={islandGeometry} position={[0, sphereCenterY, 0]} receiveShadow castShadow>
					<meshStandardMaterial vertexColors roughness={0.85} />
				</mesh>

				{/* Additional lobes for organic shape */}
				{lobes.map((lobe, i) => (
					<IslandLobe
						key={i}
						position={[lobe.offsetX, 0, lobe.offsetZ]}
						scale={lobe.scale}
						seed={seed + 1000 + i * 100}
						elongation={elongation * 0.9}
					/>
				))}

				{/* Palm trees */}
				{layout.palmPositions.map((palm, i) => (
					<PalmTree
						key={i}
						position={palm.pos}
						scale={palm.scale}
						hasCoconuts={palm.hasCoconuts}
						tint={palm.tint}
					/>
				))}

				{/* Beach chair */}
				<BeachChair position={layout.chairPos} rotation={layout.chairRotation} />

				{/* Tiki shack (conditional) */}
				{hasTikiShack && (
					<TikiShack
						position={layout.shackPos}
						rotation={layout.shackRotation}
						color={libraryColor}
					/>
				)}

				{/* Rocks / micro props */}
				{rockPositions.map((rock, i) => (
					<mesh
						key={`rock-${i}`}
						position={rock.pos}
						rotation={[0, rock.rotation, 0.1]}
						scale={rock.scale}
						castShadow
						receiveShadow
					>
						<dodecahedronGeometry args={[1, 0]} />
						<meshStandardMaterial color="#8B8B83" roughness={0.9} />
					</mesh>
				))}

				{/* Shrubs / small plants */}
				{shrubPositions.map((shrub, i) => (
					<group key={`shrub-${i}`} position={shrub.pos}>
						{/* Main bush - cluster of spheres */}
						<mesh scale={shrub.scale} castShadow>
							<icosahedronGeometry args={[1, 1]} />
							<meshStandardMaterial color={shrub.color} roughness={0.8} />
						</mesh>
						{/* Secondary smaller spheres for fullness */}
						<mesh
							position={[shrub.scale * 0.5, shrub.scale * 0.2, shrub.scale * 0.3]}
							scale={shrub.scale * 0.7}
							castShadow
						>
							<icosahedronGeometry args={[1, 1]} />
							<meshStandardMaterial color={shrub.color} roughness={0.8} />
						</mesh>
						<mesh
							position={[-shrub.scale * 0.4, shrub.scale * 0.1, -shrub.scale * 0.4]}
							scale={shrub.scale * 0.6}
							castShadow
						>
							<icosahedronGeometry args={[1, 1]} />
							<meshStandardMaterial color={shrub.color} roughness={0.8} />
						</mesh>
					</group>
				))}

				{/* Grass tufts and flowers */}
				{grassTufts.map((tuft, i) => (
					<mesh key={`tuft-${i}`} position={tuft.pos} scale={tuft.scale} castShadow>
						<coneGeometry args={[0.5, 1.5, 4]} />
						<meshStandardMaterial color={tuft.color} roughness={0.7} />
					</mesh>
				))}

				{/* Discovery beacon */}
				{!isDiscovered && (
					<pointLight position={[0, 3.5, 0]} color={libraryColor} intensity={2.5} distance={12} />
				)}
			</group>

			{/* Flag */}
			<Flag
				position={signWorldPos}
				color={libraryColor}
				libraryId={library?.id}
				partnerId={partner?.id}
				partnerHref={partner?.href}
				islandId={data.id}
			/>
		</>
	);
}
