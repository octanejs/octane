import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';
import { CULL_DISTANCES } from '../hooks/useDistanceCulling';
import { getWaveHeight } from './Ocean';

interface AIShipProps {
	id: string;
	color: string;
}

function AIShip({ id, color }: AIShipProps) {
	const groupRef = useRef<THREE.Group>(null);
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

	useFrame((state) => {
		const { otherPlayers } = useGameStore.getState();
		const player = otherPlayers.find((p) => p.id === id);

		if (!player || !groupRef.current) return;

		const time = state.clock.elapsedTime;
		const [px, _py, pz] = player.position;

		const waveY = getWaveHeight(px, pz, time);
		const bobY = Math.sin(time * 1.8 + px * 0.1) * 0.03;
		const bobRoll = Math.sin(time * 1.5 + pz * 0.1) * 0.03;
		const bobPitch = Math.sin(time * 2.2) * 0.02;

		const waveTiltX = getWaveHeight(px + 0.3, pz, time) - waveY;
		const waveTiltZ = getWaveHeight(px, pz + 0.3, time) - waveY;

		groupRef.current.position.set(px, waveY + bobY + 0.2, pz);
		groupRef.current.rotation.set(
			bobPitch + waveTiltZ * 0.4,
			player.rotation,
			bobRoll + waveTiltX * 0.4,
		);
	});

	return (
		<group ref={groupRef}>
			<primitive object={clonedScene} scale={0.32} />
			{/* Simple cannon on side */}
			<group position={[0.35, 0.28, 0]}>
				<mesh castShadow>
					<cylinderGeometry args={[0.07, 0.09, 0.05, 12]} />
					<meshStandardMaterial color="#4a4a4a" metalness={0.8} roughness={0.3} />
				</mesh>
				<mesh position={[0.12, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
					<cylinderGeometry args={[0.035, 0.045, 0.22, 12]} />
					<meshStandardMaterial color="#3a3a3a" metalness={0.9} roughness={0.2} />
				</mesh>
			</group>
		</group>
	);
}

export function AIShips() {
	const { stage, otherPlayers } = useGameStore();
	const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());

	// Distance culling for AI ships
	useFrame(() => {
		const { boatPosition, otherPlayers } = useGameStore.getState();
		const maxDistSq = CULL_DISTANCES.ship * CULL_DISTANCES.ship;

		const newVisible = new Set<string>();
		for (const player of otherPlayers) {
			if (!player.isAI) continue;
			const dx = player.position[0] - boatPosition[0];
			const dz = player.position[2] - boatPosition[2];
			if (dx * dx + dz * dz < maxDistSq) {
				newVisible.add(player.id);
			}
		}

		if (newVisible.size !== visibleIds.size || [...newVisible].some((id) => !visibleIds.has(id))) {
			setVisibleIds(newVisible);
		}
	});

	// Only render in battle stage
	if (stage !== 'battle') return null;

	const aiPlayers = otherPlayers.filter((p) => p.isAI && visibleIds.has(p.id));

	return (
		<>
			{aiPlayers.map((player) => (
				<AIShip key={player.id} id={player.id} color={player.color} />
			))}
		</>
	);
}
