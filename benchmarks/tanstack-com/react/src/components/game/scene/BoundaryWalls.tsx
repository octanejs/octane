import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';

const PLANE_SIZE = 100; // How far the boundary plane extends outward
const PLANE_OPACITY = 0.6;

type Edge = 'north' | 'south' | 'east' | 'west';

interface BoundaryPlaneProps {
	edge: Edge;
}

function BoundaryPlane({ edge }: BoundaryPlaneProps) {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame((_, delta) => {
		if (!meshRef.current) return;
		const material = meshRef.current.material as THREE.MeshBasicMaterial;
		const { boundaryEdges, worldBoundary, phase } = useGameStore.getState();

		// Hide when not playing
		if (phase !== 'playing') {
			meshRef.current.visible = false;
			return;
		}

		const active = boundaryEdges[edge];

		// Fade in/out
		const targetOpacity = active ? PLANE_OPACITY : 0;
		material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, delta * 6);
		meshRef.current.visible = material.opacity > 0.01;

		// Update position based on dynamic world boundary
		const planeWidth = worldBoundary * 2 + PLANE_SIZE * 2;
		const planeY = 0.5;

		if (edge === 'north') {
			meshRef.current.position.set(0, planeY, worldBoundary + PLANE_SIZE / 2);
			meshRef.current.scale.set(planeWidth / 100, PLANE_SIZE / 100, 1);
		} else if (edge === 'south') {
			meshRef.current.position.set(0, planeY, -worldBoundary - PLANE_SIZE / 2);
			meshRef.current.scale.set(planeWidth / 100, PLANE_SIZE / 100, 1);
		} else if (edge === 'east') {
			meshRef.current.position.set(worldBoundary + PLANE_SIZE / 2, planeY, 0);
			meshRef.current.scale.set(PLANE_SIZE / 100, planeWidth / 100, 1);
		} else {
			meshRef.current.position.set(-worldBoundary - PLANE_SIZE / 2, planeY, 0);
			meshRef.current.scale.set(PLANE_SIZE / 100, planeWidth / 100, 1);
		}
	});

	return (
		<mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={999}>
			<planeGeometry args={[100, 100]} />
			<meshBasicMaterial
				color="#dd4444"
				transparent
				opacity={0}
				side={THREE.DoubleSide}
				depthTest={false}
			/>
		</mesh>
	);
}

export function BoundaryWalls() {
	// Read phase inside useFrame to avoid re-renders
	// Component always renders, but planes check phase internally
	return (
		<group>
			<BoundaryPlane edge="north" />
			<BoundaryPlane edge="south" />
			<BoundaryPlane edge="east" />
			<BoundaryPlane edge="west" />
		</group>
	);
}
