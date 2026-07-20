import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';

interface FlagProps {
	position: [number, number, number];
	color: string;
	libraryId?: string;
	partnerId?: string;
	partnerHref?: string;
	islandId: string;
}

interface ConfettiParticle {
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	rotation: THREE.Euler;
	rotationSpeed: THREE.Vector3;
	scale: number;
	color: string;
	lifetime: number;
}

const POLE_HEIGHT = 2.5;
const FLAG_HEIGHT = 0.5;
const FLAG_WIDTH = 0.7;

export function Flag({
	position,
	color,
	libraryId,
	partnerId: _partnerId,
	partnerHref,
	islandId,
}: FlagProps) {
	const groupRef = useRef<THREE.Group>(null);
	const flagGroupRef = useRef<THREE.Group>(null);

	// Animation state
	const scaleRef = useRef(0);
	const scaleVelocityRef = useRef(0);
	const flagPositionRef = useRef(0); // 0 = bottom, 1 = top
	const completionScaleRef = useRef(1);
	const wasDiscoveredRef = useRef(false);

	// Confetti
	const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
	const confettiSpawnedRef = useRef(false);

	const [hovered, setHovered] = useState(false);

	// Create isoceles triangle geometry for flag
	// Long edge on left (touching pole), point on right (centered vertically)
	const flagGeometry = useMemo(() => {
		const shape = new THREE.Shape();
		// Top-left corner (on pole, top of flag)
		shape.moveTo(0, FLAG_HEIGHT / 2);
		// Point on right (centered vertically)
		shape.lineTo(FLAG_WIDTH, 0);
		// Bottom-left corner (on pole, bottom of flag)
		shape.lineTo(0, -FLAG_HEIGHT / 2);
		// Close back to start (this draws the long edge on the pole)
		shape.closePath();

		const geo = new THREE.ShapeGeometry(shape);
		geo.computeVertexNormals();
		return geo;
	}, []);

	const handleClick = () => {
		if (partnerHref) {
			window.open(partnerHref, '_blank');
		} else if (libraryId) {
			window.location.href = `/${libraryId}`;
		}
	};

	// Generate confetti colors based on flag color
	const confettiColors = useMemo(() => {
		const base = new THREE.Color(color);
		const hsl = { h: 0, s: 0, l: 0 };
		base.getHSL(hsl);
		return [
			color,
			'#FFFFFF',
			`#${new THREE.Color().setHSL((hsl.h + 0.1) % 1, 0.8, 0.6).getHexString()}`,
			`#${new THREE.Color().setHSL((hsl.h - 0.1 + 1) % 1, 0.8, 0.6).getHexString()}`,
			'#FFD700',
		];
	}, [color]);

	const spawnConfetti = () => {
		const particles: ConfettiParticle[] = [];
		const spawnPos = new THREE.Vector3(0, POLE_HEIGHT - 0.3, 0);

		for (let i = 0; i < 30; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 2 + Math.random() * 3;
			const upSpeed = 3 + Math.random() * 2;

			particles.push({
				position: spawnPos
					.clone()
					.add(
						new THREE.Vector3(
							(Math.random() - 0.5) * 0.3,
							Math.random() * 0.2,
							(Math.random() - 0.5) * 0.3,
						),
					),
				velocity: new THREE.Vector3(Math.cos(angle) * speed, upSpeed, Math.sin(angle) * speed),
				rotation: new THREE.Euler(
					Math.random() * Math.PI * 2,
					Math.random() * Math.PI * 2,
					Math.random() * Math.PI * 2,
				),
				rotationSpeed: new THREE.Vector3(
					(Math.random() - 0.5) * 10,
					(Math.random() - 0.5) * 10,
					(Math.random() - 0.5) * 10,
				),
				scale: 0.05 + Math.random() * 0.08,
				color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
				lifetime: 2 + Math.random(),
			});
		}

		setConfetti(particles);
	};

	useFrame((_, delta) => {
		if (!groupRef.current || !flagGroupRef.current) return;

		const { nearbyIsland, discoveryProgress, discoveredIslands } = useGameStore.getState();
		const isNearby = nearbyIsland?.id === islandId;
		const isDiscovered = discoveredIslands.has(islandId);

		const dt = Math.min(delta, 0.1);

		// Spring animation for initial scale (appears when nearby)
		const targetScale = isNearby || isDiscovered ? 1 : 0;
		const stiffness = 200;
		const damping = 15;

		const displacement = scaleRef.current - targetScale;
		const springForce = -stiffness * displacement;
		const dampingForce = -damping * scaleVelocityRef.current;

		scaleVelocityRef.current += (springForce + dampingForce) * dt;
		scaleRef.current += scaleVelocityRef.current * dt;
		scaleRef.current = Math.max(0, Math.min(1.3, scaleRef.current));

		// Flag position (rises with discovery progress)
		const targetFlagPos = isDiscovered ? 1 : isNearby ? discoveryProgress : 0;
		flagPositionRef.current = THREE.MathUtils.lerp(flagPositionRef.current, targetFlagPos, 0.1);

		// Completion scale bump
		if (isDiscovered && !wasDiscoveredRef.current) {
			wasDiscoveredRef.current = true;
			completionScaleRef.current = 1.3; // Bump up

			// Spawn confetti
			if (!confettiSpawnedRef.current) {
				confettiSpawnedRef.current = true;
				spawnConfetti();
			}
		}

		// Lerp completion scale back to normal (slightly larger than 1)
		const finalCompletionScale = isDiscovered ? 1.1 : 1;
		completionScaleRef.current = THREE.MathUtils.lerp(
			completionScaleRef.current,
			finalCompletionScale,
			0.05,
		);

		// Apply transforms
		const finalScale = scaleRef.current * completionScaleRef.current;
		groupRef.current.scale.setScalar(Math.max(0.001, finalScale));

		// Position flag along pole (from near bottom to near top)
		const flagBottomY = 0.4; // Starting position near bottom
		const flagTopY = POLE_HEIGHT - FLAG_HEIGHT / 2 - 0.15; // End position near top (accounting for flag height)
		const flagY = flagBottomY + flagPositionRef.current * (flagTopY - flagBottomY);
		flagGroupRef.current.position.y = flagY;

		// Update confetti
		if (confetti.length > 0) {
			const updatedConfetti = confetti
				.map((p) => ({
					...p,
					position: p.position.clone().add(p.velocity.clone().multiplyScalar(dt)),
					velocity: p.velocity
						.clone()
						.setY(p.velocity.y - 9.8 * dt)
						.multiplyScalar(0.98),
					rotation: new THREE.Euler(
						p.rotation.x + p.rotationSpeed.x * dt,
						p.rotation.y + p.rotationSpeed.y * dt,
						p.rotation.z + p.rotationSpeed.z * dt,
					),
					lifetime: p.lifetime - dt,
				}))
				.filter((p) => p.lifetime > 0 && p.position.y > -1);

			setConfetti(updatedConfetti);
		}

		// Reset confetti spawned flag when leaving
		if (!isNearby && !isDiscovered) {
			confettiSpawnedRef.current = false;
			wasDiscoveredRef.current = false;
		}
	});

	return (
		<group position={[position[0] + 0.5, position[1] - 0.25, position[2] + 0.5]}>
			<group
				ref={groupRef}
				scale={0.001}
				onClick={handleClick}
				onPointerOver={() => {
					setHovered(true);
					document.body.style.cursor = 'pointer';
				}}
				onPointerOut={() => {
					setHovered(false);
					document.body.style.cursor = 'auto';
				}}
			>
				{/* White pole */}
				<mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow>
					<cylinderGeometry args={[0.03, 0.04, POLE_HEIGHT, 8]} />
					<meshStandardMaterial color="#FFFFFF" roughness={0.3} />
				</mesh>

				{/* White ball on top */}
				<mesh position={[0, POLE_HEIGHT + 0.05, 0]} castShadow>
					<sphereGeometry args={[0.06, 12, 12]} />
					<meshStandardMaterial color="#FFFFFF" roughness={0.3} />
				</mesh>

				{/* Flag group (moves up/down) */}
				<group ref={flagGroupRef} position={[0, 0.3, 0]}>
					{/* Isoceles flag - left edge touches pole */}
					<mesh geometry={flagGeometry} position={[0.03, 0, 0.01]} castShadow>
						<meshStandardMaterial
							color={color}
							side={THREE.DoubleSide}
							roughness={0.6}
							emissive={hovered ? color : '#000000'}
							emissiveIntensity={hovered ? 0.2 : 0}
						/>
					</mesh>
				</group>
			</group>

			{/* Confetti particles */}
			{confetti.map((particle, i) => (
				<mesh
					key={i}
					position={particle.position}
					rotation={particle.rotation}
					scale={particle.scale * (particle.lifetime / 2)}
				>
					<boxGeometry args={[1, 1, 0.1]} />
					<meshStandardMaterial color={particle.color} roughness={0.5} />
				</mesh>
			))}
		</group>
	);
}
