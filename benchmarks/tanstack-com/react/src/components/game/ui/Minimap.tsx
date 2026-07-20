import { useEffect, useState } from 'react';
import { useGameStore, type OtherPlayer } from '../hooks/useGameStore';
import { getLibraryColor } from '../utils/colors';

// Minimap dimensions - diamond shape, responsive
const MIN_WIDTH = 140;
const MAX_WIDTH = 280;
const ASPECT_RATIO = 0.59; // Height/Width ratio for isometric diamond

function getMinimapSize() {
	const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
	const targetWidth = Math.round(screenWidth * 0.2);
	const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, targetWidth));
	const height = Math.round(width * ASPECT_RATIO);
	return { width, height };
}

// AI territory constants (must match AISystem.ts)
import {
	ROAM_LEASH,
	OUTER_RIM_ROAM_LEASH,
	CORNER_BOSS_ROAM_LEASH,
} from '../engine/systems/AISystem';

export function Minimap() {
	const { phase, islands, expandedIslands, showcaseIslands, cornerIslands, discoveredIslands } =
		useGameStore();
	const [minimapSize, setMinimapSize] = useState(getMinimapSize);
	const [boatState, setBoatState] = useState({
		x: 0,
		z: 0,
		rotation: 0,
		worldBoundary: 85,
	});
	const [aiShips, setAiShips] = useState<OtherPlayer[]>([]);
	const [debugMode, setDebugMode] = useState(false);

	// Handle resize
	useEffect(() => {
		const handleResize = () => setMinimapSize(getMinimapSize());
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		if (phase !== 'playing') return;

		const interval = setInterval(() => {
			const { boatPosition, boatRotation, worldBoundary, otherPlayers, showCollisionDebug } =
				useGameStore.getState();
			setBoatState({
				x: boatPosition[0],
				z: boatPosition[2],
				rotation: boatRotation,
				worldBoundary,
			});
			setDebugMode(showCollisionDebug);
			// Use actual home positions from AI data
			const ais = otherPlayers.filter((p) => p.isAI);
			setAiShips(ais);
		}, 50);

		return () => clearInterval(interval);
	}, [phase]);

	if (phase !== 'playing') return null;

	const { width: W, height: H } = minimapSize;

	// All islands (core + expanded + showcase + corners)
	const allIslands = [...islands, ...expandedIslands, ...showcaseIslands, ...cornerIslands];

	// Convert world position to isometric minimap position
	const worldToMinimap = (worldX: number, worldZ: number) => {
		const nx = worldX / boatState.worldBoundary;
		const nz = worldZ / boatState.worldBoundary;

		const isoX = (nx - nz) * 0.5;
		const isoY = (nx + nz) * 0.5;

		return {
			x: W / 2 + isoX * (W / 2) * 0.9,
			y: H / 2 + isoY * (H / 2) * 0.9,
		};
	};

	const boatPos = worldToMinimap(boatState.x, boatState.z);
	const arrowRotation = -boatState.rotation * (180 / Math.PI) + 225;

	const discoveredIslandsList = allIslands.filter((island) => discoveredIslands.has(island.id));

	// Diamond path for background
	const diamondPath = `M ${W / 2} 2 L ${W - 2} ${H / 2} L ${W / 2} ${H - 2} L 2 ${H / 2} Z`;

	// Scale factors for elements based on minimap size
	const scale = W / 160;

	return (
		<div
			className="absolute bottom-4 left-4 z-10 pointer-events-none"
			style={{ width: W, height: H }}
		>
			<svg width={W} height={H} style={{ overflow: 'visible' }}>
				{/* Background diamond */}
				<path
					d={diamondPath}
					fill="rgba(0, 0, 0, 0.5)"
					stroke="rgba(255, 255, 255, 0.3)"
					strokeWidth={1}
				/>

				{/* Clip content to diamond */}
				<defs>
					<clipPath id="diamond-clip">
						<path d={diamondPath} />
					</clipPath>
				</defs>

				<g clipPath="url(#diamond-clip)">
					{/* Debug: AI roam boundaries (larger, dashed) */}
					{debugMode &&
						aiShips.map((ai) => {
							if (!ai.homePosition) return null;
							const homePos = worldToMinimap(ai.homePosition[0], ai.homePosition[1]);
							// Convert roam leash radius to minimap scale
							const leashRadiusNormalized = ROAM_LEASH / boatState.worldBoundary;
							const rx = leashRadiusNormalized * (W / 2) * 0.9 * 0.5;
							const ry = leashRadiusNormalized * (H / 2) * 0.9 * 0.5;
							return (
								<ellipse
									key={`roam-${ai.id}`}
									cx={homePos.x}
									cy={homePos.y}
									rx={rx}
									ry={ry}
									fill="none"
									stroke={ai.color || '#e74c3c'}
									strokeWidth={1}
									strokeDasharray="4,2"
									opacity={0.3}
									transform={`rotate(45, ${homePos.x}, ${homePos.y})`}
								/>
							);
						})}

					{/* Debug: AI max chase boundaries (leash distance) */}
					{debugMode &&
						aiShips.map((ai) => {
							if (!ai.homePosition) return null;
							const homePos = worldToMinimap(ai.homePosition[0], ai.homePosition[1]);
							// Use leash distance (max chase range) based on AI type
							const isBoss = ai.difficulty === 'boss';
							const isOuterRim = ai.difficulty === 'elite' || ai.difficulty === 'hard';
							const leashDistance = isBoss
								? CORNER_BOSS_ROAM_LEASH
								: isOuterRim
									? OUTER_RIM_ROAM_LEASH
									: ROAM_LEASH;
							const leashNormalized = leashDistance / boatState.worldBoundary;
							const rx = leashNormalized * (W / 2) * 0.9 * 0.5;
							const ry = leashNormalized * (H / 2) * 0.9 * 0.5;
							return (
								<ellipse
									key={`leash-${ai.id}`}
									cx={homePos.x}
									cy={homePos.y}
									rx={rx}
									ry={ry}
									fill="none"
									stroke={ai.color || '#e74c3c'}
									strokeWidth={1}
									opacity={0.5}
									transform={`rotate(45, ${homePos.x}, ${homePos.y})`}
								/>
							);
						})}

					{/* Discovered islands */}
					{discoveredIslandsList.map((island) => {
						const pos = worldToMinimap(island.position[0], island.position[2]);
						const isCorner = island.id.startsWith('corner-');
						const color =
							island.type === 'library' && island.library
								? getLibraryColor(island.library.id)
								: island.type === 'partner'
									? '#f59e0b' // Amber for partners
									: isCorner
										? '#ef4444' // Red for corner boss islands
										: island.type === 'showcase'
											? '#8b5cf6' // Purple for showcases
											: '#8b5cf6';
						const size = (1.5 + island.scale * 1) * scale;

						return (
							<circle key={island.id} cx={pos.x} cy={pos.y} r={size} fill={color} opacity={0.9} />
						);
					})}

					{/* Debug: AI home positions */}
					{debugMode &&
						aiShips.map((ai) => {
							if (!ai.homePosition) return null;
							const homePos = worldToMinimap(ai.homePosition[0], ai.homePosition[1]);
							return (
								<circle
									key={`home-${ai.id}`}
									cx={homePos.x}
									cy={homePos.y}
									r={3 * scale}
									fill={ai.color || '#e74c3c'}
									opacity={0.3}
								/>
							);
						})}

					{/* AI ships (debug only) */}
					{debugMode &&
						aiShips.map((ai) => {
							const pos = worldToMinimap(ai.position[0], ai.position[2]);
							const rotation = -ai.rotation * (180 / Math.PI) + 225;
							return (
								<g
									key={ai.id}
									transform={`translate(${pos.x}, ${pos.y}) rotate(${rotation}) scale(${scale})`}
								>
									<polygon
										points="0,-4 3,3 0,1.5 -3,3"
										fill={ai.color || '#e74c3c'}
										stroke="white"
										strokeWidth={1}
									/>
								</g>
							);
						})}

					{/* Boat arrow */}
					<g
						transform={`translate(${boatPos.x}, ${boatPos.y}) rotate(${arrowRotation}) scale(${scale})`}
					>
						<polygon
							points="0,-4 2.5,3 0,1.5 -2.5,3"
							fill="white"
							stroke="rgba(0,0,0,0.5)"
							strokeWidth={0.5}
						/>
					</g>
				</g>

				{/* Debug: show AI count and world boundary */}
				{debugMode && (
					<text x={5} y={12} fill="yellow" fontSize={8 * scale}>
						AI: {aiShips.length} | WB: {boatState.worldBoundary}
					</text>
				)}
			</svg>
		</div>
	);
}
