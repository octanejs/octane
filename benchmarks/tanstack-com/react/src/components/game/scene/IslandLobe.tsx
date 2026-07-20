import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';

interface IslandLobeProps {
	position: [number, number, number];
	scale: number;
	seed: number;
	elongation?: number;
}

export function IslandLobe({ position, scale, seed, elongation = 1 }: IslandLobeProps) {
	const sphereRadius = 8;
	const islandRadius = 2.2 * elongation;

	const surfaceHeight = Math.sqrt(sphereRadius * sphereRadius - islandRadius * islandRadius);
	const sphereCenterY = -surfaceHeight + 0.3;

	const geometry = useMemo(() => {
		const geo = new THREE.SphereGeometry(sphereRadius, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.25);

		const posAttr = geo.attributes.position;
		const colors: number[] = [];

		const foamColor = new THREE.Color('#E8F4F8');
		const shallowColor = new THREE.Color(COLORS.ocean.shallow);
		const sandColorLight = new THREE.Color(COLORS.sand.light);
		const sandColorMid = new THREE.Color(COLORS.sand.mid);
		const grassColorDark = new THREE.Color('#1B5E20');
		const grassColorLight = new THREE.Color('#2E7D32');

		for (let i = 0; i < posAttr.count; i++) {
			const x = posAttr.getX(i);
			const y = posAttr.getY(i);
			const z = posAttr.getZ(i);

			const angle = Math.atan2(z, x);
			const distFromCenter = Math.sqrt(x * x + z * z);
			const edgeNoise = Math.sin(angle * 5 + seed) * 0.15 + Math.sin(angle * 9 + seed * 2) * 0.08;

			const normalizedY = (y - sphereRadius * 0.75) / (sphereRadius * 0.25);

			if (normalizedY < 0.5 && normalizedY > 0.1 && distFromCenter > 1) {
				const noiseAmount = (0.5 - Math.abs(normalizedY - 0.3)) * 0.4;
				posAttr.setX(i, x + (x / distFromCenter) * edgeNoise * noiseAmount * distFromCenter * 0.12);
				posAttr.setZ(i, z + (z / distFromCenter) * edgeNoise * noiseAmount * distFromCenter * 0.12);
			}

			// Absolute Y height, scaled to world coordinates for consistent coloring
			const absoluteY = (y + sphereCenterY) * scale;

			const colorNoise = Math.sin(angle * 7 + seed) * 0.5 + 0.5;

			// Fixed height thresholds (world Y coordinates) - must match Island.tsx
			const waterY = -0.6;
			const foamY = -0.35;
			const sandY = -0.25;
			const grassY = 0.0;

			let color: THREE.Color;

			if (absoluteY < waterY) {
				color = shallowColor.clone();
				color.lerp(new THREE.Color('#1A8A9A'), colorNoise * 0.2);
			} else if (absoluteY < foamY) {
				const foamAmount = THREE.MathUtils.smoothstep(absoluteY, waterY, foamY);
				color = shallowColor.clone().lerp(foamColor, foamAmount);
				color.lerp(new THREE.Color('#FFFFFF'), colorNoise * 0.3 * foamAmount);
			} else if (absoluteY < sandY) {
				const sandProgress = THREE.MathUtils.smoothstep(absoluteY, foamY, sandY);
				const wetSand = sandColorLight.clone().lerp(foamColor, 0.15);
				color = wetSand.clone().lerp(sandColorMid, sandProgress);
				color.lerp(sandColorMid.clone().multiplyScalar(0.95), colorNoise * 0.15);
			} else {
				const grassProgress = THREE.MathUtils.smoothstep(absoluteY, sandY, grassY);
				// Position-based noise for natural grass variation (not angle-based)
				const grassNoise = Math.sin(x * 3.7 + seed) * Math.cos(z * 4.1 + seed * 1.3) * 0.5 + 0.5;
				// Solid base grass with subtle noise variation
				const baseGrass = grassColorDark.clone().lerp(grassColorLight, 0.3);
				const grassColor = baseGrass.clone().lerp(grassColorDark, grassNoise * 0.25);
				color = sandColorMid.clone().lerp(grassColor, grassProgress);
			}

			colors.push(color.r, color.g, color.b);
		}

		geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geo.computeVertexNormals();

		return geo;
	}, [sphereRadius, seed, scale, sphereCenterY]);

	return (
		<group position={position} scale={scale}>
			{/* Foam ring */}
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
				<ringGeometry args={[islandRadius * 0.97, islandRadius * 1.03, 32]} />
				<meshStandardMaterial color="#FFFFFF" transparent opacity={0.5} />
			</mesh>

			{/* Shallow water ring */}
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
				<ringGeometry args={[islandRadius * 1.0, islandRadius * 1.2, 32]} />
				<meshStandardMaterial color={COLORS.ocean.shallow} transparent opacity={0.4} />
			</mesh>

			{/* Spherical cap */}
			<mesh geometry={geometry} position={[0, sphereCenterY, 0]} receiveShadow castShadow>
				<meshStandardMaterial vertexColors roughness={0.85} />
			</mesh>
		</group>
	);
}
