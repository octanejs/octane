import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';
import { getWaveHeight } from './Ocean';

interface ShipProps {
	color?: string;
}

export function Ship({ color = '#FFEEDD' }: ShipProps) {
	const groupRef = useRef<THREE.Group>(null);
	const wakeRef = useRef<THREE.Points>(null);
	const cannonRef = useRef<THREE.Group>(null);

	const { scene } = useGLTF('/models/ship.glb');

	const clonedScene = useMemo(() => {
		const clone = scene.clone();
		const tintColor = new THREE.Color(color);

		clone.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;

				if (child.material) {
					child.material = child.material.clone();
					const mat = child.material as THREE.MeshStandardMaterial;
					mat.color.multiply(tintColor);

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
		return clone;
	}, [scene, color]);

	// Wake particles
	const wakeParticles = useMemo(() => {
		const count = 100;
		const positions = new Float32Array(count * 3);
		const sizes = new Float32Array(count);

		for (let i = 0; i < count; i++) {
			positions[i * 3] = 0;
			positions[i * 3 + 1] = 0;
			positions[i * 3 + 2] = 0;
			sizes[i] = 0;
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

		return geometry;
	}, []);

	// Animate ship with waves and wake
	useFrame((state) => {
		const { boatPosition, boatRotation, boatVelocity } = useGameStore.getState();

		if (groupRef.current) {
			const time = state.clock.elapsedTime;

			// Wave height at boat position
			const waveY = getWaveHeight(boatPosition[0], boatPosition[2], time);

			// Gentle bobbing
			const bobY = Math.sin(time * 1.8) * 0.03;
			const bobRoll = Math.sin(time * 1.5) * 0.03;
			const bobPitch = Math.sin(time * 2.2) * 0.02;

			// Wave-based tilting
			const waveTiltX = getWaveHeight(boatPosition[0] + 0.3, boatPosition[2], time) - waveY;
			const waveTiltZ = getWaveHeight(boatPosition[0], boatPosition[2] + 0.3, time) - waveY;

			groupRef.current.position.set(boatPosition[0], waveY + bobY + 0.2, boatPosition[2]);
			groupRef.current.rotation.set(
				bobPitch + waveTiltZ * 0.4,
				boatRotation,
				bobRoll + waveTiltX * 0.4,
			);

			// Animate cannon (slight sway)
			if (cannonRef.current) {
				cannonRef.current.rotation.y = Math.sin(time * 0.5) * 0.1;
			}
		}

		// Update wake particles
		if (wakeRef.current) {
			const positions = wakeRef.current.geometry.attributes.position as THREE.BufferAttribute;
			const sizes = wakeRef.current.geometry.attributes.size as THREE.BufferAttribute;

			for (let i = positions.count - 1; i > 0; i--) {
				positions.setXYZ(
					i,
					positions.getX(i - 1),
					positions.getY(i - 1) - 0.002,
					positions.getZ(i - 1),
				);
				const currentSize = sizes.getX(i - 1);
				sizes.setX(i, currentSize > 0.01 ? currentSize * 0.995 : 0);
			}

			if (boatVelocity > 0.05 && Math.random() < 0.25) {
				const backOffset = 0.7;
				const spread = (Math.random() - 0.5) * 0.5;

				const newX =
					boatPosition[0] - Math.sin(boatRotation) * backOffset + Math.cos(boatRotation) * spread;
				const newZ =
					boatPosition[2] - Math.cos(boatRotation) * backOffset - Math.sin(boatRotation) * spread;

				positions.setXYZ(0, newX, 0.05, newZ);
				sizes.setX(0, 0.2 + boatVelocity * 0.15);
			} else {
				positions.setXYZ(0, boatPosition[0], -10, boatPosition[2]);
				sizes.setX(0, 0);
			}

			positions.needsUpdate = true;
			sizes.needsUpdate = true;
		}
	});

	return (
		<>
			<group ref={groupRef}>
				<primitive object={clonedScene} scale={0.28} rotation={[0, 0, 0]} />

				{/* Side cannon */}
				<group ref={cannonRef} position={[0.4, 0.3, 0]}>
					{/* Cannon base */}
					<mesh castShadow>
						<cylinderGeometry args={[0.08, 0.1, 0.06, 12]} />
						<meshStandardMaterial color="#4a4a4a" metalness={0.8} roughness={0.3} />
					</mesh>
					{/* Cannon barrel */}
					<mesh position={[0.15, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
						<cylinderGeometry args={[0.04, 0.05, 0.25, 12]} />
						<meshStandardMaterial color="#3a3a3a" metalness={0.9} roughness={0.2} />
					</mesh>
					{/* Cannon muzzle */}
					<mesh position={[0.27, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
						<cylinderGeometry args={[0.055, 0.04, 0.04, 12]} />
						<meshStandardMaterial color="#2a2a2a" metalness={0.9} roughness={0.2} />
					</mesh>
				</group>
			</group>

			{/* Wake/splash particles */}
			<points ref={wakeRef} geometry={wakeParticles} frustumCulled={false}>
				<pointsMaterial color="#FFFFFF" size={0.5} transparent opacity={0.9} sizeAttenuation />
			</points>
		</>
	);
}

useGLTF.preload('/models/ship.glb');
