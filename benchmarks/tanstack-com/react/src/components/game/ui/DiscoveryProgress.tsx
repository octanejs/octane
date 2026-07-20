import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { getLibraryColor } from '../utils/colors';

const SIZE = 50;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DiscoveryProgress() {
	const { phase, nearbyIsland, discoveredIslands } = useGameStore();
	const [progress, setProgress] = useState(0);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (phase !== 'playing') return;

		const interval = setInterval(() => {
			const { discoveryProgress, nearbyIsland, discoveredIslands } = useGameStore.getState();

			// Only show for undiscovered islands
			const shouldShow =
				nearbyIsland && !discoveredIslands.has(nearbyIsland.id) && discoveryProgress > 0;

			setIsVisible(!!shouldShow);
			setProgress(discoveryProgress);
		}, 50);

		return () => clearInterval(interval);
	}, [phase]);

	if (phase !== 'playing') return null;
	if (!isVisible || !nearbyIsland) return null;

	// Already discovered
	if (discoveredIslands.has(nearbyIsland.id)) return null;

	const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
	const color =
		nearbyIsland.type === 'library' && nearbyIsland.library
			? getLibraryColor(nearbyIsland.library.id)
			: nearbyIsland.type === 'partner'
				? '#f59e0b' // Amber for partners
				: '#8b5cf6'; // Purple for showcase

	const name =
		nearbyIsland.type === 'library' && nearbyIsland.library
			? nearbyIsland.library.name
			: nearbyIsland.type === 'partner' && nearbyIsland.partner
				? nearbyIsland.partner.name
				: 'Unknown';

	return (
		<div className="absolute top-[60%] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
			<div
				className="relative flex flex-col items-center justify-center transition-opacity duration-300"
				style={{ opacity: isVisible ? 1 : 0 }}
			>
				{/* SVG Doughnut */}
				<svg
					width={SIZE}
					height={SIZE}
					className="transform -rotate-90"
					style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }}
				>
					{/* Background circle */}
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke="rgba(255,255,255,0.2)"
						strokeWidth={STROKE_WIDTH}
					/>
					{/* Progress circle */}
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke={color}
						strokeWidth={STROKE_WIDTH}
						strokeLinecap="round"
						strokeDasharray={CIRCUMFERENCE}
						strokeDashoffset={strokeDashoffset}
						style={{ transition: 'stroke-dashoffset 0.1s ease-out' }}
					/>
				</svg>

				{/* Center content */}
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{ top: 0, height: SIZE }}
				>
					<div className="text-white text-[10px] font-bold text-center">
						{Math.round(progress * 100)}%
					</div>
				</div>

				{/* Label below */}
				<div
					className="mt-2 whitespace-nowrap text-white text-xs font-semibold px-2 py-0.5 rounded-full"
					style={{
						backgroundColor: 'rgba(0,0,0,0.6)',
						textShadow: '0 1px 2px rgba(0,0,0,0.5)',
					}}
				>
					Discovering {name}...
				</div>
			</div>
		</div>
	);
}
