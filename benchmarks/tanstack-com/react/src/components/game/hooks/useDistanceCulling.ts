import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from './useGameStore';

// Distance thresholds for different object types
export const CULL_DISTANCES = {
	island: 80,
	rock: 60,
	ship: 100,
	detail: 40, // palm trees, shrubs, etc within islands
};

/**
 * Hook that returns whether an object at given position should be rendered
 * based on distance from the player's boat.
 *
 * Uses a ref to avoid re-renders - check .current in useFrame or render.
 */
export function useDistanceCulling(position: [number, number, number], maxDistance: number) {
	const visibleRef = useRef(true);

	useFrame(() => {
		const { boatPosition } = useGameStore.getState();
		const dx = position[0] - boatPosition[0];
		const dz = position[2] - boatPosition[2];
		const distSq = dx * dx + dz * dz;
		visibleRef.current = distSq < maxDistance * maxDistance;
	});

	return visibleRef;
}

/**
 * Batch version - filters an array of positioned objects by distance.
 * More efficient than individual hooks for many objects.
 */
export function filterByDistance<T extends { position: [number, number, number] }>(
	items: T[],
	boatPosition: [number, number, number],
	maxDistance: number,
): T[] {
	const maxDistSq = maxDistance * maxDistance;
	return items.filter((item) => {
		const dx = item.position[0] - boatPosition[0];
		const dz = item.position[2] - boatPosition[2];
		return dx * dx + dz * dz < maxDistSq;
	});
}
