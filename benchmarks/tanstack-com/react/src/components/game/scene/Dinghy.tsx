import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';
import { getWaveHeight } from './Ocean';

interface DinghyProps {
	color?: string;
}

export function Dinghy({ color = '#FFF5E6' }: DinghyProps) {
	const groupRef = useRef<THREE.Group>(null);
	const wakeRef = useRef<THREE.Points>(null);

	const { scene } = useGLTF('/models/rowboat.glb');

	const clonedScene = useMemo(() => {
		const clone = scene.clone();
		const tintColor = new THREE.Color(color);

		clone.traverse((child) => {
			// Hide cannon parts - the rowboat model has a cannon we don't want for early game
			const name = child.name.toLowerCase();
			if (name.includes('cannon') || name.includes('gun')) {
				child.visible = false;
				return;
			}

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
		const count = 60;
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

	// Animate dinghy with waves, wake, and paddles
	useFrame((state) => {
		const { boatPosition, boatRotation, boatVelocity } = useGameStore.getState();

		if (groupRef.current) {
			const time = state.clock.elapsedTime;

			// Wave height at boat position
			const waveY = getWaveHeight(boatPosition[0], boatPosition[2], time);

			// More pronounced bobbing for small boat
			const bobY = Math.sin(time * 2.2) * 0.05;
			const bobRoll = Math.sin(time * 1.8) * 0.06;
			const bobPitch = Math.sin(time * 2.5) * 0.04;

			// Wave-based tilting
			const waveTiltX = getWaveHeight(boatPosition[0] + 0.2, boatPosition[2], time) - waveY;
			const waveTiltZ = getWaveHeight(boatPosition[0], boatPosition[2] + 0.2, time) - waveY;

			groupRef.current.position.set(boatPosition[0], waveY + bobY + 0.15, boatPosition[2]);
			groupRef.current.rotation.set(
				bobPitch + waveTiltZ * 0.5,
				boatRotation,
				bobRoll + waveTiltX * 0.5,
			);
		}

		// Update wake particles
		if (wakeRef.current) {
			const positions = wakeRef.current.geometry.attributes.position as THREE.BufferAttribute;
			const sizes = wakeRef.current.geometry.attributes.size as THREE.BufferAttribute;

			// Shift all particles back
			for (let i = positions.count - 1; i > 0; i--) {
				positions.setXYZ(
					i,
					positions.getX(i - 1),
					positions.getY(i - 1) - 0.002,
					positions.getZ(i - 1),
				);
				const currentSize = sizes.getX(i - 1);
				sizes.setX(i, currentSize > 0.01 ? currentSize * 0.99 : 0);
			}

			// Add new particles when moving (every 4th frame)
			if (boatVelocity > 0.05 && Math.random() < 0.25) {
				const backOffset = 0.5;
				const spread = (Math.random() - 0.5) * 0.3;

				const newX =
					boatPosition[0] - Math.sin(boatRotation) * backOffset + Math.cos(boatRotation) * spread;
				const newZ =
					boatPosition[2] - Math.cos(boatRotation) * backOffset - Math.sin(boatRotation) * spread;

				positions.setXYZ(0, newX, -0.35, newZ);
				sizes.setX(0, 0.12 + boatVelocity * 0.08);
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
				{/* Rowboat model */}
				<primitive object={clonedScene} scale={0.4} />
			</group>

			{/* Wake/splash particles */}
			<points ref={wakeRef} geometry={wakeParticles} frustumCulled={false}>
				<pointsMaterial color="#FFFFFF" size={0.3} transparent opacity={0.7} sizeAttenuation />
			</points>
		</>
	);
}
