import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../hooks/useGameStore';

const CANNONBALL_RADIUS = 0.15;
const GRAVITY = -15;
const MAX_LIFETIME = 3000; // 3 seconds
const HIT_RADIUS = 1.5; // Collision radius for hitting ships

// Shared geometry and material for performance
const ballGeometry = new THREE.SphereGeometry(CANNONBALL_RADIUS, 12, 12);
const ballMaterial = new THREE.MeshStandardMaterial({
	color: '#333333',
	metalness: 0.8,
	roughness: 0.3,
});

function Cannonball({ id }: { id: number }) {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(() => {
		const { cannonballs } = useGameStore.getState();
		const ball = cannonballs.find((c) => c.id === id);

		if (!ball || !meshRef.current) return;

		meshRef.current.position.set(...ball.position);
	});

	return <mesh ref={meshRef} geometry={ballGeometry} material={ballMaterial} castShadow />;
}

// Smoke/splash effect when cannonball lands
function SplashEffect({
	position,
	onComplete,
}: {
	position: [number, number, number];
	onComplete: () => void;
}) {
	const groupRef = useRef<THREE.Group>(null);
	// eslint-disable-next-line react-hooks/purity
	const startTime = useRef(Date.now());

	useFrame(() => {
		if (!groupRef.current) return;

		const elapsed = Date.now() - startTime.current;
		const progress = elapsed / 500; // 500ms animation

		if (progress >= 1) {
			onComplete();
			return;
		}

		// Expand and fade
		const scale = 1 + progress * 2;
		groupRef.current.scale.set(scale, scale, scale);
		groupRef.current.children.forEach((child) => {
			if (child instanceof THREE.Mesh) {
				const mat = child.material as THREE.MeshBasicMaterial;
				mat.opacity = 1 - progress;
			}
		});
	});

	return (
		<group ref={groupRef} position={position}>
			<mesh>
				<sphereGeometry args={[0.3, 8, 8]} />
				<meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
			</mesh>
		</group>
	);
}

export function Cannonballs() {
	const { stage, cannonballs } = useGameStore();
	const splashEffects = useRef<Array<{ id: number; position: [number, number, number] }>>([]);

	// Physics update for all cannonballs
	useFrame((_, delta) => {
		if (stage !== 'battle') return;

		const {
			cannonballs,
			updateCannonballs,
			removeCannonball: _removeCannonball,
			otherPlayers,
			setOtherPlayers,
		} = useGameStore.getState();

		const now = Date.now();
		const dt = Math.min(delta, 0.1);
		const updatedBalls = [];
		const hitsToProcess: Array<{ ballId: number; playerId: string }> = [];

		for (const ball of cannonballs) {
			// Check lifetime
			if (now - ball.createdAt > MAX_LIFETIME) {
				continue; // Remove old cannonballs
			}

			// Update position
			const newX = ball.position[0] + ball.velocity[0] * dt;
			const newY = ball.position[1] + ball.velocity[1] * dt;
			const newZ = ball.position[2] + ball.velocity[2] * dt;

			// Apply gravity to Y velocity
			const newVelY = ball.velocity[1] + GRAVITY * dt;

			// Check if hit water
			if (newY <= 0) {
				// Create splash effect
				splashEffects.current.push({
					id: ball.id,
					position: [newX, 0.1, newZ],
				});
				continue; // Remove cannonball
			}

			// Check collision with AI ships (player cannonballs)
			if (ball.ownerId === 'player') {
				for (const player of otherPlayers) {
					const dx = newX - player.position[0];
					const dz = newZ - player.position[2];
					const dist = Math.sqrt(dx * dx + dz * dz);

					if (dist < HIT_RADIUS && newY < 2) {
						hitsToProcess.push({ ballId: ball.id, playerId: player.id });
						splashEffects.current.push({
							id: ball.id,
							position: [newX, 0.5, newZ],
						});
						break;
					}
				}
			}

			// Check collision with player (AI cannonballs)
			if (ball.ownerId !== 'player') {
				const { boatPosition } = useGameStore.getState();
				const dx = newX - boatPosition[0];
				const dz = newZ - boatPosition[2];
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < HIT_RADIUS && newY < 2) {
					hitsToProcess.push({ ballId: ball.id, playerId: 'player' });
					splashEffects.current.push({
						id: ball.id,
						position: [newX, 0.5, newZ],
					});
				}
			}

			// Check if this ball was hit
			if (hitsToProcess.some((h) => h.ballId === ball.id)) {
				continue;
			}

			updatedBalls.push({
				...ball,
				position: [newX, newY, newZ] as [number, number, number],
				velocity: [ball.velocity[0], newVelY, ball.velocity[2]] as [number, number, number],
			});
		}

		// Process hits - damage AI ships and player
		if (hitsToProcess.length > 0) {
			const { boatHealth, setPhase } = useGameStore.getState();

			// Check for player hit
			const playerHit = hitsToProcess.find((h) => h.playerId === 'player');
			if (playerHit) {
				const newHealth = Math.max(0, boatHealth - 20);
				useGameStore.setState({ boatHealth: newHealth });

				// Check for game over
				if (newHealth <= 0) {
					setPhase('gameover');
				}
			}

			// Process AI hits
			const updatedPlayers = otherPlayers.map((player) => {
				const hit = hitsToProcess.find((h) => h.playerId === player.id);
				if (hit) {
					const newHealth = player.health - 25; // 25 damage per hit
					return { ...player, health: Math.max(0, newHealth) };
				}
				return player;
			});
			// Remove dead ships
			setOtherPlayers(updatedPlayers.filter((p) => p.health > 0));
		}

		updateCannonballs(updatedBalls);
	});

	if (stage !== 'battle') return null;

	return (
		<>
			{cannonballs.map((ball) => (
				<Cannonball key={ball.id} id={ball.id} />
			))}
			{/* eslint-disable-next-line react-hooks/refs */}
			{splashEffects.current.map((splash) => (
				<SplashEffect
					key={splash.id}
					position={splash.position}
					onComplete={() => {
						splashEffects.current = splashEffects.current.filter((s) => s.id !== splash.id);
					}}
				/>
			))}
		</>
	);
}
