/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';

export function IslandIndicator() {
	const { phase, stage } = useGameStore();
	const [indicator, setIndicator] = useState<{
		screenX: number;
		screenY: number;
		rotation: number;
		distance: number;
	} | null>(null);

	useEffect(() => {
		if (phase !== 'playing' || stage !== 'exploration') {
			setIndicator(null);
			return;
		}

		const interval = setInterval(() => {
			const { boatPosition, discoveredIslands, islands } = useGameStore.getState();

			// Find closest undiscovered island
			let closest: { id: string; position: [number, number, number] } | null = null;
			let closestDist = Infinity;

			for (const island of islands) {
				if (discoveredIslands.has(island.id)) continue;

				const dx = island.position[0] - boatPosition[0];
				const dz = island.position[2] - boatPosition[2];
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < closestDist) {
					closestDist = dist;
					closest = island;
				}
			}

			if (!closest) {
				setIndicator(null);
				return;
			}

			// Vector from boat to island in world space
			const dx = closest.position[0] - boatPosition[0];
			const dz = closest.position[2] - boatPosition[2];

			// Camera is at boat + [22, 20, 20], looking at boat
			// This means camera looks from +X,+Z quadrant toward -X,-Z
			//
			// Screen mapping (camera looking toward -X, -Z):
			// - Screen RIGHT: world +X, -Z direction
			// - Screen UP: world -X, -Z direction (away from camera, toward horizon)
			// - Screen DOWN: world +X, +Z direction (toward camera)
			// - Screen LEFT: world -X, +Z direction
			//
			// For isometric at 45°: screenX = (x - z), screenY = -(x + z) for "up = away"
			// But we want "up on screen" = negative screenY in CSS

			// Screen X: positive = right = more +X or more -Z
			const screenX = (dx - dz) * 0.707;
			// Screen Y: positive = down in CSS = toward camera = more +X and +Z
			const screenY = (dx + dz) * 0.5;

			// Normalize to get direction
			const len = Math.sqrt(screenX * screenX + screenY * screenY);
			const normX = len > 0 ? screenX / len : 0;
			const normY = len > 0 ? screenY / len : 0;

			// Position on screen edge (percentage from center)
			const edgeDistance = 42;
			const finalX = normX * edgeDistance;
			const finalY = normY * edgeDistance;

			// Arrow rotation (SVG arrow points up, rotate to point toward island)
			const rotation = Math.atan2(normX, -normY) * (180 / Math.PI);

			setIndicator({
				screenX: finalX,
				screenY: finalY,
				rotation,
				distance: closestDist,
			});
		}, 100);

		return () => clearInterval(interval);
	}, [phase, stage]);

	if (!indicator || stage !== 'exploration') return null;

	// Hide if very close (island is probably on screen)
	if (indicator.distance < 15) return null;

	return (
		<div
			className="absolute z-30 pointer-events-none transition-all duration-150"
			style={{
				left: `calc(50% + ${indicator.screenX}%)`,
				top: `calc(50% + ${indicator.screenY}%)`,
				transform: 'translate(-50%, -50%)',
			}}
		>
			{/* Pulsing glow */}
			<div
				className="absolute rounded-full animate-ping"
				style={{
					backgroundColor: '#FACC15',
					opacity: 0.3,
					width: 32,
					height: 32,
					left: -4,
					top: -4,
				}}
			/>

			{/* Arrow */}
			<div
				style={{
					transform: `rotate(${indicator.rotation}deg)`,
				}}
			>
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					style={{
						filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
					}}
				>
					<path d="M12 2L17 22H7L12 2Z" fill="#FACC15" stroke="#A16207" strokeWidth="2" />
				</svg>
			</div>

			{/* Distance label */}
			<div
				className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold mt-1"
				style={{
					color: '#FACC15',
					textShadow: '0 1px 3px rgba(0,0,0,0.9)',
					top: '100%',
				}}
			>
				{Math.round(indicator.distance)}m
			</div>
		</div>
	);
}
