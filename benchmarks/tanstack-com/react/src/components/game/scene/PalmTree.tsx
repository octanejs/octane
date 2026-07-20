import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface PalmTreeProps {
	position?: [number, number, number];
	scale?: number;
	hasCoconuts?: boolean;
	tint?: string;
}

export function PalmTree({
	position = [0, 0, 0],
	scale = 1,
	hasCoconuts = false,
	tint,
}: PalmTreeProps) {
	const groupRef = useRef<THREE.Group>(null);

	const { scene } = useGLTF('/models/palm-tree.glb');

	const { clonedScene, randomRotation } = useMemo(() => {
		const clone = scene.clone();
		const tintColor = tint ? new THREE.Color(tint) : null;

		clone.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;

				if (child.material) {
					child.material = child.material.clone();
					const mat = child.material as THREE.MeshStandardMaterial;

					// Apply tint by multiplying material color
					if (tintColor && mat.color) {
						mat.color.multiply(tintColor);
					}

					// Fix texture filtering to remove pixelated stripes
					if (mat.map) {
						mat.map.minFilter = THREE.LinearMipmapLinearFilter;
						mat.map.magFilter = THREE.LinearFilter;
						mat.map.generateMipmaps = true;
						mat.map.anisotropy = 16;
						mat.map.needsUpdate = true;
					}
				}
			}
		});
		// Stable random rotation based on position
		const rot = (position[0] * 1000 + position[2] * 100) % (Math.PI * 2);
		return { clonedScene: clone, randomRotation: rot };
	}, [scene, position, tint]);

	// Gentle swaying animation
	useFrame((state) => {
		if (groupRef.current) {
			const time = state.clock.elapsedTime;
			groupRef.current.rotation.z = Math.sin(time * 0.4 + position[0]) * 0.03;
			groupRef.current.rotation.x = Math.sin(time * 0.3 + position[2]) * 0.02;
		}
	});

	return (
		<group position={position} scale={scale}>
			<group ref={groupRef}>
				<primitive object={clonedScene} scale={0.7} rotation={[0, randomRotation, 0]} />
			</group>

			{/* Coconuts cluster */}
			{hasCoconuts && (
				<group position={[0, 2.8, 0]}>
					{[
						[0.1, 0, 0.08],
						[-0.08, -0.05, 0.1],
						[0.02, 0.05, -0.1],
					].map((pos, i) => (
						<mesh key={i} position={pos as [number, number, number]} castShadow>
							<sphereGeometry args={[0.08, 8, 8]} />
							<meshStandardMaterial color="#8B4513" roughness={0.6} />
						</mesh>
					))}
				</group>
			)}
		</group>
	);
}

useGLTF.preload('/models/palm-tree.glb');
