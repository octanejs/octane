import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';

interface TikiShackProps {
	position?: [number, number, number];
	rotation?: number;
	color: string;
}

export function TikiShack({ position = [0, 0, 0], rotation = 0, color }: TikiShackProps) {
	const roofGeometry = useMemo(() => {
		return new THREE.ConeGeometry(1.2, 1, 6);
	}, []);

	return (
		<group position={position} rotation={[0, rotation, 0]}>
			{/* Posts */}
			{[
				[-0.6, 0, -0.6],
				[0.6, 0, -0.6],
				[-0.6, 0, 0.6],
				[0.6, 0, 0.6],
			].map((pos, i) => (
				<mesh key={i} position={[pos[0], 0.6, pos[2]]} castShadow>
					<cylinderGeometry args={[0.08, 0.1, 1.2, 8]} />
					<meshStandardMaterial color={COLORS.tiki.post} roughness={0.8} />
				</mesh>
			))}

			{/* Thatched roof */}
			<mesh geometry={roofGeometry} position={[0, 2, 0]} castShadow>
				<meshStandardMaterial color={COLORS.tiki.thatch} roughness={0.9} />
			</mesh>

			{/* Roof edge trim */}
			<mesh position={[0, 1.5, 0]}>
				<cylinderGeometry args={[1.2, 1.2, 0.1, 6, 1, true]} />
				<meshStandardMaterial color={COLORS.tiki.roof} roughness={0.8} side={THREE.DoubleSide} />
			</mesh>

			{/* Roof ornament */}
			<mesh position={[0, 2.5, 0]} castShadow>
				<sphereGeometry args={[0.12, 8, 8]} />
				<meshStandardMaterial color={color} roughness={0.5} />
			</mesh>
		</group>
	);
}
