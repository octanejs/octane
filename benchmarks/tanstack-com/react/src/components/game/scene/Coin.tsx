import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CoinProps {
	position: [number, number, number];
	id: number;
}

// Shared geometry and material for all coins
const coinGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12);
const coinMaterial = new THREE.MeshStandardMaterial({
	color: '#FFD700',
	metalness: 0.8,
	roughness: 0.3,
	emissive: '#FF8C00',
	emissiveIntensity: 0.4,
});

export function Coin({ position, id }: CoinProps) {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame((state) => {
		if (meshRef.current) {
			const t = state.clock.elapsedTime;
			meshRef.current.rotation.y = t * 2;
			meshRef.current.position.y = position[1] + Math.sin(t * 2 + id * 0.5) * 0.15;
		}
	});

	return (
		<mesh
			ref={meshRef}
			position={[position[0], position[1], position[2]]}
			geometry={coinGeometry}
			material={coinMaterial}
		/>
	);
}
