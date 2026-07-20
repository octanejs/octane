import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { IslandData } from '../utils/islandGenerator';
import { useGameStore } from '../hooks/useGameStore';
import { CULL_DISTANCES } from '../hooks/useDistanceCulling';

interface RockData {
	position: [number, number, number];
	scale: [number, number, number];
	rotation: [number, number, number];
	color: string;
}

interface RockGroupData {
	position: [number, number, number];
	rocks: RockData[];
	foamRadius: number;
}

interface OceanRocksProps {
	islands: IslandData[];
	groupCount?: number;
	spread?: number;
}

function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

// Individual rock with animated rings
function AnimatedRock({ rock, index }: { rock: RockData; index: number }) {
	const foamRef = useRef<THREE.Mesh>(null);
	const waterRef = useRef<THREE.Mesh>(null);
	const rockSize = Math.max(rock.scale[0], rock.scale[2]);

	useFrame((state) => {
		const t = state.clock.elapsedTime;
		// Each rock has slightly different phase based on index
		const phase = index * 0.7;
		const scale = 1 + Math.sin(t * 0.8 + phase) * 0.12;

		if (foamRef.current) {
			foamRef.current.scale.set(scale, scale, 1);
		}
		if (waterRef.current) {
			// Water ring pulses slightly out of phase
			const waterScale = 1 + Math.sin(t * 0.8 + phase + 0.5) * 0.1;
			waterRef.current.scale.set(waterScale, waterScale, 1);
		}
	});

	return (
		<group position={rock.position}>
			{/* Rock mesh */}
			<mesh scale={rock.scale} rotation={rock.rotation} castShadow receiveShadow>
				<dodecahedronGeometry args={[1, 0]} />
				<meshStandardMaterial color={rock.color} roughness={0.9} />
			</mesh>

			{/* Foam ring around this rock */}
			<mesh
				ref={foamRef}
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, -rock.position[1] - 0.15, 0]}
			>
				<ringGeometry args={[rockSize * 0.9, rockSize * 1.3, 16]} />
				<meshStandardMaterial color="#FFFFFF" transparent opacity={0.4} />
			</mesh>

			{/* Shallow water ring around this rock */}
			<mesh
				ref={waterRef}
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, -rock.position[1] - 0.18, 0]}
			>
				<ringGeometry args={[rockSize * 1.2, rockSize * 1.8, 16]} />
				<meshStandardMaterial color="#40E0D0" transparent opacity={0.2} />
			</mesh>
		</group>
	);
}

export function OceanRocks({ islands, groupCount = 20, spread = 120 }: OceanRocksProps) {
	const groupRef = useRef<THREE.Group>(null);
	const [visibleGroups, setVisibleGroups] = useState<Set<number>>(new Set());

	const rockGroups = useMemo(() => {
		const result: RockGroupData[] = [];
		const rockColors = ['#7A8B8B', '#8B9A9A', '#6B7B7B', '#9AA8A8', '#5C6B6B'];
		const minDistFromIsland = 10;

		for (let g = 0; g < groupCount; g++) {
			const groupSeed = g * 54321;

			// Random group position
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
			const rocks: RockData[] = [];
			let maxRockScale = 0;

			for (let r = 0; r < rockCount; r++) {
				const rockSeed = groupSeed + r * 100;

				// Position within group - first rock at center, others scattered nearby
				const offsetDist = r === 0 ? 0 : 1.2 + seededRandom(rockSeed) * 1.0;
				const offsetAngle = seededRandom(rockSeed + 1) * Math.PI * 2;
				const localX = Math.cos(offsetAngle) * offsetDist;
				const localZ = Math.sin(offsetAngle) * offsetDist;

				// Varying sizes - first rock tends to be larger
				const sizeMultiplier = r === 0 ? 1 : 0.4 + seededRandom(rockSeed + 2) * 0.5;
				const baseScale = (0.25 + seededRandom(rockSeed + 3) * 0.55) * sizeMultiplier;

				maxRockScale = Math.max(maxRockScale, baseScale);

				rocks.push({
					position: [localX, -0.1 - baseScale * 0.1, localZ],
					scale: [
						baseScale * (0.8 + seededRandom(rockSeed + 4) * 0.4),
						baseScale * (0.4 + seededRandom(rockSeed + 5) * 0.4),
						baseScale * (0.8 + seededRandom(rockSeed + 6) * 0.4),
					],
					rotation: [
						seededRandom(rockSeed + 7) * 0.4,
						seededRandom(rockSeed + 8) * Math.PI * 2,
						seededRandom(rockSeed + 9) * 0.4,
					],
					color: rockColors[Math.floor(seededRandom(rockSeed + 10) * rockColors.length)],
				});
			}

			result.push({
				position: [groupX, 0, groupZ],
				rocks,
				foamRadius: maxRockScale + 0.4 + rockCount * 0.15,
			});
		}

		return result;
	}, [islands, groupCount, spread]);

	// Distance culling + gentle bob with waves
	useFrame((state) => {
		const { boatPosition } = useGameStore.getState();
		const maxDistSq = CULL_DISTANCES.rock * CULL_DISTANCES.rock;
		const time = state.clock.elapsedTime;

		// Update visibility based on distance
		const newVisible = new Set<number>();
		rockGroups.forEach((group, i) => {
			const dx = group.position[0] - boatPosition[0];
			const dz = group.position[2] - boatPosition[2];
			if (dx * dx + dz * dz < maxDistSq) {
				newVisible.add(i);
			}
		});

		// Only update state if changed
		if (
			newVisible.size !== visibleGroups.size ||
			[...newVisible].some((i) => !visibleGroups.has(i))
		) {
			setVisibleGroups(newVisible);
		}

		// Bob visible groups
		if (groupRef.current) {
			groupRef.current.children.forEach((group, i) => {
				const offset = i * 0.7;
				group.position.y = Math.sin(time * 0.4 + offset) * 0.04;
			});
		}
	});

	return (
		<group ref={groupRef}>
			{rockGroups.map((group, gi) => (
				<group key={gi} position={group.position} visible={visibleGroups.has(gi)}>
					{/* Individual rocks with animated foam/water rings */}
					{group.rocks.map((rock, ri) => (
						<AnimatedRock key={ri} rock={rock} index={gi * 10 + ri} />
					))}
				</group>
			))}
		</group>
	);
}
