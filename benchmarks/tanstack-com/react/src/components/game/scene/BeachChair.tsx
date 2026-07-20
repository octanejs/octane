import { useMemo } from 'react';
import * as THREE from 'three';

interface BeachChairProps {
	position?: [number, number, number];
	rotation?: number;
	color?: string;
}

export function BeachChair({
	position = [0, 0, 0],
	rotation = 0,
	color = '#DC143C', // Cherry red
}: BeachChairProps) {
	const woodColor = '#D97706';

	const seatGeometry = useMemo(() => {
		return new THREE.BoxGeometry(0.6, 0.05, 0.8);
	}, []);

	const backGeometry = useMemo(() => {
		return new THREE.BoxGeometry(0.6, 0.6, 0.05);
	}, []);

	return (
		<group position={position} rotation={[0, rotation, 0]} scale={0.65}>
			{/* Frame legs - back */}
			<mesh position={[-0.25, 0.25, -0.35]} castShadow>
				<cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
				<meshStandardMaterial color={woodColor} roughness={0.7} />
			</mesh>
			<mesh position={[0.25, 0.25, -0.35]} castShadow>
				<cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
				<meshStandardMaterial color={woodColor} roughness={0.7} />
			</mesh>

			{/* Frame legs - front */}
			<mesh position={[-0.25, 0.15, 0.35]} castShadow>
				<cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
				<meshStandardMaterial color={woodColor} roughness={0.7} />
			</mesh>
			<mesh position={[0.25, 0.15, 0.35]} castShadow>
				<cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
				<meshStandardMaterial color={woodColor} roughness={0.7} />
			</mesh>

			{/* Seat (angled) */}
			<mesh geometry={seatGeometry} position={[0, 0.35, 0]} rotation={[-0.2, 0, 0]} castShadow>
				<meshStandardMaterial color={color} roughness={0.5} />
			</mesh>

			{/* Back rest (angled) */}
			<mesh geometry={backGeometry} position={[0, 0.6, -0.3]} rotation={[-0.5, 0, 0]} castShadow>
				<meshStandardMaterial color={color} roughness={0.5} />
			</mesh>

			{/* Stripes on seat */}
			{[-0.15, 0.15].map((x, i) => (
				<mesh key={i} position={[x, 0.36, 0]} rotation={[-0.2, 0, 0]} castShadow>
					<boxGeometry args={[0.12, 0.06, 0.75]} />
					<meshStandardMaterial color="#FFFFFF" roughness={0.5} />
				</mesh>
			))}

			{/* Stripes on back */}
			{[-0.15, 0.15].map((x, i) => (
				<mesh key={i} position={[x, 0.61, -0.28]} rotation={[-0.5, 0, 0]} castShadow>
					<boxGeometry args={[0.12, 0.55, 0.06]} />
					<meshStandardMaterial color="#FFFFFF" roughness={0.5} />
				</mesh>
			))}
		</group>
	);
}
