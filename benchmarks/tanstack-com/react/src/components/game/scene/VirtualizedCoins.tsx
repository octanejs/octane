import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, type CoinData } from '../hooks/useGameStore';

const RENDER_DISTANCE = 50;

// Shared geometry and material
const coinGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12);
const coinMaterial = new THREE.MeshStandardMaterial({
	color: '#FFD700',
	metalness: 0.8,
	roughness: 0.3,
	emissive: '#FF8C00',
	emissiveIntensity: 0.4,
});

interface CoinMeshProps {
	coin: CoinData;
}

function CoinMesh({ coin }: CoinMeshProps) {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame((state) => {
		if (meshRef.current) {
			const t = state.clock.elapsedTime;
			meshRef.current.rotation.y = t * 2;
			meshRef.current.position.y = coin.position[1] + Math.sin(t * 2 + coin.id * 0.5) * 0.15;
		}
	});

	return (
		<mesh
			ref={meshRef}
			position={[coin.position[0], coin.position[1], coin.position[2]]}
			geometry={coinGeometry}
			material={coinMaterial}
		/>
	);
}

export function VirtualizedCoins() {
	const [visibleCoins, setVisibleCoins] = useState<CoinData[]>([]);

	useFrame(() => {
		const { coins, boatPosition } = useGameStore.getState();

		// Filter to nearby uncollected coins
		const nowVisible = coins.filter((coin) => {
			if (coin.collected) return false;
			const dx = coin.position[0] - boatPosition[0];
			const dz = coin.position[2] - boatPosition[2];
			const distSq = dx * dx + dz * dz;
			return distSq < RENDER_DISTANCE * RENDER_DISTANCE;
		});

		// Only update state if the visible set changed
		if (
			nowVisible.length !== visibleCoins.length ||
			nowVisible.some((c, i) => visibleCoins[i]?.id !== c.id)
		) {
			setVisibleCoins(nowVisible);
		}
	});

	return (
		<>
			{visibleCoins.map((coin) => (
				<CoinMesh key={coin.id} coin={coin} />
			))}
		</>
	);
}
