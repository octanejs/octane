import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../hooks/useGameStore';
import { CULL_DISTANCES } from '../hooks/useDistanceCulling';
import { Island } from './Island';
import type { IslandData } from '../utils/islandGenerator';

interface VirtualizedIslandsProps {
	islands: IslandData[];
}

export function VirtualizedIslands({ islands }: VirtualizedIslandsProps) {
	const [visibleIslands, setVisibleIslands] = useState<
		Array<{ island: IslandData; isDiscovered: boolean }>
	>([]);

	useFrame(() => {
		const { boatPosition, discoveredIslands } = useGameStore.getState();
		const maxDistSq = CULL_DISTANCES.island * CULL_DISTANCES.island;

		const nowVisible: Array<{ island: IslandData; isDiscovered: boolean }> = [];
		for (const island of islands) {
			const dx = island.position[0] - boatPosition[0];
			const dz = island.position[2] - boatPosition[2];
			if (dx * dx + dz * dz < maxDistSq) {
				nowVisible.push({
					island,
					isDiscovered: discoveredIslands.has(island.id),
				});
			}
		}

		// Only update if changed
		if (
			nowVisible.length !== visibleIslands.length ||
			nowVisible.some(
				(v, i) =>
					visibleIslands[i]?.island.id !== v.island.id ||
					visibleIslands[i]?.isDiscovered !== v.isDiscovered,
			)
		) {
			setVisibleIslands(nowVisible);
		}
	});

	return (
		<>
			{visibleIslands.map(({ island, isDiscovered }) => (
				<Island key={island.id} data={island} isDiscovered={isDiscovered} />
			))}
		</>
	);
}
