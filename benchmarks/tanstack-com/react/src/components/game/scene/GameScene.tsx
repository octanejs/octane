/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Sky } from './Sky';
import { Ocean } from './Ocean';
import { Island } from './Island';
import { Boat } from './Boat';
import { OceanRocks } from './OceanRocks';
import { VirtualizedCoins } from './VirtualizedCoins';
import { BoundaryWalls } from './BoundaryWalls';
import { AIShips } from './AIShips';
import { Cannonballs } from './Cannonballs';
import { useGameStore } from '../hooks/useGameStore';
import { useBoatControls } from '../hooks/useBoatControls';
import { useAIOpponents } from '../hooks/useAIOpponents';
import { IslandInfo3D } from './IslandInfo3D';
import {
	generateIslands,
	generateExpandedIslands,
	type IslandData,
} from '../utils/islandGenerator';
import { generateRockColliders } from '../utils/collision';
import { generateCoins } from '../utils/coinGenerator';
import { libraries } from '~/libraries';
import { partners } from '~/utils/partners';

// Filter to only active partners and convert to slim format for the game
const ACTIVE_PARTNERS = partners
	.filter((p) => p.status === 'active')
	.map((p) => ({
		id: p.id,
		name: p.name,
		href: p.href,
		brandColor: p.brandColor,
	}));

// Floating info sign for nearby island with exit animation
function NearbyIslandInfo() {
	const nearbyIsland = useGameStore((s) => s.nearbyIsland);
	const discoveredIslands = useGameStore((s) => s.discoveredIslands);
	const [displayedIsland, setDisplayedIsland] = useState<IslandData | null>(null);
	const [isExiting, setIsExiting] = useState(false);
	const [wasDiscovered, setWasDiscovered] = useState(false);

	// Track if current island is discovered
	const isDiscovered = nearbyIsland ? discoveredIslands.has(nearbyIsland.id) : false;

	useEffect(() => {
		if (nearbyIsland) {
			// New island - show it
			setIsExiting(false);
			setDisplayedIsland(nearbyIsland);
			setWasDiscovered(discoveredIslands.has(nearbyIsland.id));
		} else if (displayedIsland) {
			// Island gone - start exit animation
			setIsExiting(true);
			const timer = setTimeout(() => {
				setDisplayedIsland(null);
				setIsExiting(false);
			}, 300);
			return () => clearTimeout(timer);
		}
	}, [nearbyIsland?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	// Detect when island gets discovered while we're near it
	useEffect(() => {
		if (displayedIsland && !wasDiscovered && isDiscovered) {
			// Just got discovered - bounce it by remounting
			setWasDiscovered(true);
			setIsExiting(true);
			const timer = setTimeout(() => {
				setIsExiting(false);
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [isDiscovered, wasDiscovered, displayedIsland]);

	if (!displayedIsland) return null;

	// Key includes discovered state to force remount on discovery
	const key = `${displayedIsland.id}-${wasDiscovered}`;

	return <IslandInfo3D key={key} island={displayedIsland} exiting={isExiting} />;
}

// Isometric camera that follows the boat
const BASE_FOV = 20; // Narrow FOV for more orthographic feel

function IsometricCamera() {
	const { camera } = useThree();

	// Camera offset - slight asymmetry for less sterile feel
	const offset = useRef(new THREE.Vector3(22, 20, 20));
	const targetPosition = useRef(new THREE.Vector3());
	const currentPosition = useRef(new THREE.Vector3(22, 15, 22));
	const currentFov = useRef(BASE_FOV);

	useEffect(() => {
		// Set up orthographic-like perspective
		if (camera instanceof THREE.PerspectiveCamera) {
			// eslint-disable-next-line react-hooks/immutability
			camera.fov = BASE_FOV;
			camera.updateProjectionMatrix();
		}
	}, [camera]);

	useFrame(() => {
		// Read directly from store to avoid component re-renders
		const { boatPosition, phase, shipStats } = useGameStore.getState();
		if (phase !== 'playing') return;

		// Update FOV based on fieldOfView upgrade (higher multiplier = wider FOV = zoomed out)
		if (camera instanceof THREE.PerspectiveCamera) {
			const targetFov = BASE_FOV * shipStats.fieldOfView;
			if (Math.abs(currentFov.current - targetFov) > 0.01) {
				currentFov.current = THREE.MathUtils.lerp(currentFov.current, targetFov, 0.1);
				// eslint-disable-next-line react-hooks/immutability
				camera.fov = currentFov.current;
				camera.updateProjectionMatrix();
			}
		}

		// Target position follows boat
		targetPosition.current.set(
			boatPosition[0] + offset.current.x,
			offset.current.y,
			boatPosition[2] + offset.current.z,
		);

		// Smooth camera follow
		currentPosition.current.lerp(targetPosition.current, 0.05);
		camera.position.copy(currentPosition.current);

		// Look at boat position
		camera.lookAt(boatPosition[0], 0, boatPosition[2]);
	});

	return null;
}

// Scene content (rendered inside Canvas)
function SceneContent() {
	// Use local state for islands to trigger single re-render when loaded
	const [islands, setLocalIslands] = useState<IslandData[]>([]);
	const [expandedIslands, setLocalExpandedIslands] = useState<IslandData[]>([]);

	// Initialize game data and get islands
	useEffect(() => {
		const state = useGameStore.getState();
		if (state.islands.length > 0) {
			setLocalIslands(state.islands);
			return;
		}

		// Generate islands
		const generatedIslands = generateIslands(libraries);
		state.setIslands(generatedIslands);
		const rockColliders = generateRockColliders(generatedIslands, 30, 140);
		state.setRockColliders(rockColliders);
		const generatedCoins = generateCoins(generatedIslands);
		state.setCoins(generatedCoins);
		setLocalIslands(generatedIslands);
	}, []);

	// Check for battle stage expansion via interval
	useEffect(() => {
		const checkBattleStage = () => {
			const { stage, expandedIslands, setExpandedIslands } = useGameStore.getState();
			if (stage === 'battle' && expandedIslands.length === 0) {
				const partnerIslands = generateExpandedIslands(ACTIVE_PARTNERS);
				setExpandedIslands(partnerIslands);
				setLocalExpandedIslands(partnerIslands);
			} else if (stage === 'battle' && expandedIslands.length > 0) {
				// Sync local state with store
				setLocalExpandedIslands(expandedIslands);
			}
		};

		const interval = setInterval(checkBattleStage, 500);
		return () => clearInterval(interval);
	}, []);

	// Enable boat controls
	useBoatControls();

	// Enable AI opponents in battle stage
	useAIOpponents();

	return (
		<>
			{/* Camera */}
			<IsometricCamera />

			{/* Lighting - soft and warm */}
			<ambientLight intensity={0.5} color="#FFF8E7" />
			<directionalLight
				position={[50, 100, 50]}
				intensity={1.3}
				color="#FFF5E0"
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-far={250}
				shadow-camera-left={-100}
				shadow-camera-right={100}
				shadow-camera-top={100}
				shadow-camera-bottom={-100}
				shadow-bias={-0.0001}
				shadow-normalBias={0.04}
			/>
			<directionalLight position={[-30, 40, -30]} intensity={0.4} color="#87CEEB" />
			<hemisphereLight args={['#87CEEB', '#8B4513', 0.5]} />

			{/* Sky dome */}
			<Sky />

			{/* Ocean */}
			<Ocean />

			{/* Ocean rocks scattered around */}
			<OceanRocks islands={islands} groupCount={30} spread={140} />

			{/* Islands - render all without virtualization */}
			{islands.map((island) => (
				<Island key={island.id} data={island} isDiscovered={false} />
			))}

			{/* Partner islands (battle stage) */}
			{expandedIslands.map((island) => (
				<Island key={island.id} data={island} isDiscovered={false} />
			))}

			{/* Virtualized coins */}
			<VirtualizedCoins />

			{/* World boundary indicators */}
			<BoundaryWalls />

			{/* AI opponent ships */}
			<AIShips />

			{/* Cannonballs */}
			<Cannonballs />

			{/* Player boat */}
			<Boat color="#FFEEDD" />

			{/* Floating info for nearby discovered island */}
			<NearbyIslandInfo />
		</>
	);
}

export function GameScene() {
	return (
		<Canvas
			shadows
			camera={{
				position: [22, 15, 22],
				fov: 45,
				near: 0.1,
				far: 1000,
			}}
			gl={{
				antialias: true,
				toneMapping: THREE.ACESFilmicToneMapping,
				toneMappingExposure: 1.2,
			}}
			style={{ background: '#0EA5E9' }}
		>
			<SceneContent />
		</Canvas>
	);
}
