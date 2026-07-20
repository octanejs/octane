import { useGameStore } from '../../hooks/useGameStore';

const DISCOVERY_RADIUS = 8;
const DISCOVERY_TIME = 3; // Seconds to fully discover

export class DiscoverySystem {
	update(delta: number): void {
		const state = useGameStore.getState();
		const {
			boatPosition,
			nearbyIsland,
			discoveryProgress,
			discoveredIslands,
			setDiscoveryProgress,
			discoverIsland,
		} = state;

		if (!nearbyIsland || discoveredIslands.has(nearbyIsland.id)) return;

		const dist = Math.sqrt(
			(boatPosition[0] - nearbyIsland.position[0]) ** 2 +
				(boatPosition[2] - nearbyIsland.position[2]) ** 2,
		);

		if (dist < DISCOVERY_RADIUS) {
			// Accumulate progress
			const newProgress = Math.min(1, discoveryProgress + delta / DISCOVERY_TIME);
			setDiscoveryProgress(newProgress);

			// Discover when progress reaches 100%
			if (newProgress >= 1) {
				discoverIsland(nearbyIsland.id);
				setDiscoveryProgress(0);
			}
		} else {
			// Decay progress when outside radius
			if (discoveryProgress > 0) {
				const decayedProgress = Math.max(0, discoveryProgress - delta / (DISCOVERY_TIME * 2));
				setDiscoveryProgress(decayedProgress);
			}
		}
	}
}
