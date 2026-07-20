import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';

export function CompassIndicator() {
	const { phase, compassTarget } = useGameStore();
	const [indicator, setIndicator] = useState<{
		screenX: number;
		screenY: number;
		rotation: number;
		distance: number;
	} | null>(null);

	useEffect(() => {
		if (phase !== 'playing' || !compassTarget) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- Clearing indicator when game state changes
			setIndicator(null);
			return;
		}

		const interval = setInterval(() => {
			const { boatPosition, compassTarget } = useGameStore.getState();
			if (!compassTarget) {
				setIndicator(null);
				return;
			}

			const dx = compassTarget.position[0] - boatPosition[0];
			const dz = compassTarget.position[2] - boatPosition[2];
			const dist = Math.sqrt(dx * dx + dz * dz);

			// Screen mapping for isometric camera
			const screenX = (dx - dz) * 0.707;
			const screenY = (dx + dz) * 0.5;

			const len = Math.sqrt(screenX * screenX + screenY * screenY);
			const normX = len > 0 ? screenX / len : 0;
			const normY = len > 0 ? screenY / len : 0;

			const edgeDistance = 25;
			const finalX = normX * edgeDistance;
			const finalY = normY * edgeDistance;

			const rotation = Math.atan2(normX, -normY) * (180 / Math.PI);

			setIndicator({
				screenX: finalX,
				screenY: finalY,
				rotation,
				distance: dist,
			});
		}, 100);

		return () => clearInterval(interval);
	}, [phase, compassTarget]);

	if (!indicator || !compassTarget) return null;

	// Hide if very close
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
			{/* Pulsing glow - amber for compass */}
			<div
				className="absolute rounded-full animate-ping"
				style={{
					backgroundColor: '#f59e0b',
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
					<path d="M12 2L17 22H7L12 2Z" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
				</svg>
			</div>

			{/* Distance label */}
			<div
				className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold mt-1"
				style={{
					color: '#f59e0b',
					textShadow: '0 1px 3px rgba(0,0,0,0.9)',
					top: '100%',
				}}
			>
				🧭 {Math.round(indicator.distance)}m
			</div>
		</div>
	);
}
