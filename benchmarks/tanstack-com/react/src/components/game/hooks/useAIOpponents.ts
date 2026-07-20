import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, type OtherPlayer, type Cannonball } from './useGameStore';

const AI_SHIP_COLORS = [
	'#e74c3c', // Red
	'#9b59b6', // Purple
	'#3498db', // Blue
	'#1abc9c', // Teal
	'#f39c12', // Orange
	'#2ecc71', // Green
];

// AI behavior constants
const AI_SPEED = 4;
const AI_TURN_SPEED = 1.5;
const AI_WANDER_CHANGE_TIME = 5; // Seconds before picking new direction
const AI_AVOID_DISTANCE = 15; // Distance to start avoiding obstacles
const AI_AGGRO_DISTANCE = 50; // Distance to start chasing player
const AI_ATTACK_DISTANCE = 20; // Distance to start firing
const AI_FIRE_COOLDOWN = 2000; // ms between shots

interface AIState {
	targetAngle: number;
	wanderTimer: number;
	isAvoiding: boolean;
	isAggro: boolean;
	lastFireTime: number;
}

// Generate initial AI opponents
function generateAIOpponents(count: number, _worldBoundary: number): OtherPlayer[] {
	const opponents: OtherPlayer[] = [];

	for (let i = 0; i < count; i++) {
		// Spawn in expanded zone (outer ring)
		const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
		const radius = 100 + Math.random() * 60; // 100-160 units from center

		opponents.push({
			id: `ai-${i}`,
			isAI: true,
			position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
			rotation: Math.random() * Math.PI * 2,
			velocity: AI_SPEED * 0.5,
			boatType: 'ship',
			color: AI_SHIP_COLORS[i % AI_SHIP_COLORS.length],
			health: 100,
		});
	}

	return opponents;
}

// Create AI cannonball
function createAICannonball(
	aiPosition: [number, number, number],
	aiRotation: number,
	aiId: string,
	side: 'left' | 'right',
): Cannonball {
	const sideMultiplier = side === 'right' ? 1 : -1;
	const cannonOffset = 0.5;
	const baseSpeed = 15;

	// Position: offset perpendicular to ship heading
	const perpX = Math.cos(aiRotation) * sideMultiplier;
	const perpZ = -Math.sin(aiRotation) * sideMultiplier;
	const fireX = aiPosition[0] + perpX * cannonOffset;
	const fireZ = aiPosition[2] + perpZ * cannonOffset;

	// Velocity: fire perpendicular to ship
	const velX = Math.cos(aiRotation) * baseSpeed * sideMultiplier;
	const velZ = -Math.sin(aiRotation) * baseSpeed * sideMultiplier;

	return {
		id: Date.now() + Math.random() * 1000,
		position: [fireX, 0.5, fireZ],
		velocity: [velX, 2, velZ],
		ownerId: aiId,
		createdAt: Date.now(),
	};
}

export function useAIOpponents() {
	const { setOtherPlayers } = useGameStore.getState();

	// Store AI state (not in global store to avoid re-renders)
	const aiStates = useRef<Map<string, AIState>>(new Map());
	const initialized = useRef(false);

	// Initialize AI opponents when entering battle stage
	useEffect(() => {
		// Check stage inside effect, subscribe via interval to avoid re-render loop
		const checkAndInit = () => {
			const { stage, otherPlayers, worldBoundary } = useGameStore.getState();

			// Reset initialized flag if we're in battle but have no AI ships (restart scenario)
			if (stage === 'battle' && initialized.current && otherPlayers.length === 0) {
				initialized.current = false;
				aiStates.current.clear();
			}

			if (stage === 'battle' && !initialized.current) {
				const aiOpponents = generateAIOpponents(4, worldBoundary);
				setOtherPlayers(aiOpponents);
				initialized.current = true;

				// Initialize AI states
				aiOpponents.forEach((ai) => {
					aiStates.current.set(ai.id, {
						targetAngle: ai.rotation,
						wanderTimer: Math.random() * AI_WANDER_CHANGE_TIME,
						isAvoiding: false,
						isAggro: false,
						lastFireTime: 0,
					});
				});
			}
		};

		checkAndInit();
		const interval = setInterval(checkAndInit, 500);
		return () => clearInterval(interval);
	}, [setOtherPlayers]);

	// Update AI behavior each frame
	useFrame((_, delta) => {
		const { phase, stage, otherPlayers, boatPosition, islands, worldBoundary, cannonballs } =
			useGameStore.getState();
		if (phase !== 'playing' || stage !== 'battle') return;
		const dt = Math.min(delta, 0.1);

		const newCannonballs: Cannonball[] = [];

		const updatedPlayers = otherPlayers.map((player) => {
			if (!player.isAI) return player;

			let state = aiStates.current.get(player.id);
			if (!state) {
				state = {
					targetAngle: player.rotation,
					wanderTimer: 0,
					isAvoiding: false,
					isAggro: false,
					lastFireTime: 0,
				};
				aiStates.current.set(player.id, state);
			}

			const [px, py, pz] = player.position;

			// Check distance to player
			const dxToPlayer = boatPosition[0] - px;
			const dzToPlayer = boatPosition[2] - pz;
			const distToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dzToPlayer * dzToPlayer);

			// Aggro check
			state.isAggro = distToPlayer < AI_AGGRO_DISTANCE;

			// Update wander timer (only when not aggro)
			if (!state.isAggro) {
				state.wanderTimer -= dt;
				if (state.wanderTimer <= 0) {
					state.targetAngle = Math.random() * Math.PI * 2;
					state.wanderTimer = AI_WANDER_CHANGE_TIME + Math.random() * 3;
				}
			}

			// Check for obstacles (world boundary, islands)
			let avoidAngle = state.targetAngle;
			state.isAvoiding = false;

			// Avoid world boundary
			const boundaryMargin = 20;
			if (px < -worldBoundary + boundaryMargin) {
				avoidAngle = 0;
				state.isAvoiding = true;
			} else if (px > worldBoundary - boundaryMargin) {
				avoidAngle = Math.PI;
				state.isAvoiding = true;
			} else if (pz < -worldBoundary + boundaryMargin) {
				avoidAngle = Math.PI / 2;
				state.isAvoiding = true;
			} else if (pz > worldBoundary - boundaryMargin) {
				avoidAngle = -Math.PI / 2;
				state.isAvoiding = true;
			}

			// Avoid islands
			if (!state.isAvoiding) {
				for (const island of islands) {
					const dx = px - island.position[0];
					const dz = pz - island.position[2];
					const dist = Math.sqrt(dx * dx + dz * dz);
					const avoidRadius = island.scale * 4 + AI_AVOID_DISTANCE;

					if (dist < avoidRadius) {
						avoidAngle = Math.atan2(dx, dz);
						state.isAvoiding = true;
						break;
					}
				}
			}

			// Determine target angle
			let targetAngle: number;
			if (state.isAvoiding) {
				targetAngle = avoidAngle;
			} else if (state.isAggro) {
				// Chase player - but offset to get broadside angle for firing
				const angleToPlayer = Math.atan2(dxToPlayer, dzToPlayer);
				// Try to position perpendicular to player for broadside attack
				if (distToPlayer < AI_ATTACK_DISTANCE) {
					// Circle around player
					targetAngle = angleToPlayer + Math.PI / 2;
				} else {
					// Chase directly
					targetAngle = angleToPlayer;
				}
			} else {
				targetAngle = state.targetAngle;
			}

			// Calculate new rotation (turn toward target)
			let newRotation = player.rotation;
			let angleDiff = targetAngle - newRotation;

			// Normalize angle difference
			while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
			while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

			// Turn toward target
			const turnAmount = AI_TURN_SPEED * dt;
			if (Math.abs(angleDiff) > 0.05) {
				if (angleDiff > 0) {
					newRotation += Math.min(turnAmount, angleDiff);
				} else {
					newRotation -= Math.min(turnAmount, -angleDiff);
				}
			}

			// Move forward
			const speed = state.isAvoiding ? AI_SPEED * 0.7 : state.isAggro ? AI_SPEED * 1.2 : AI_SPEED;
			const moveX = Math.sin(newRotation) * speed * dt;
			const moveZ = Math.cos(newRotation) * speed * dt;

			let newX = px + moveX;
			let newZ = pz + moveZ;

			// Hard clamp to world boundary
			newX = Math.max(-worldBoundary + 5, Math.min(worldBoundary - 5, newX));
			newZ = Math.max(-worldBoundary + 5, Math.min(worldBoundary - 5, newZ));

			// Attack logic - fire cannons when in range
			const now = Date.now();
			if (
				state.isAggro &&
				distToPlayer < AI_ATTACK_DISTANCE &&
				now - state.lastFireTime > AI_FIRE_COOLDOWN
			) {
				// Check if player is roughly to our side (broadside angle)
				const angleToPlayerFromShip = Math.atan2(dxToPlayer, dzToPlayer);
				let relativeAngle = angleToPlayerFromShip - newRotation;
				while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
				while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

				// Fire if player is roughly to our side (within 90 degrees of perpendicular)
				const absRelAngle = Math.abs(relativeAngle);
				if (absRelAngle > Math.PI / 4 && absRelAngle < (3 * Math.PI) / 4) {
					// Determine which side to fire
					const side = relativeAngle > 0 ? 'left' : 'right';
					newCannonballs.push(createAICannonball([newX, py, newZ], newRotation, player.id, side));
					state.lastFireTime = now;
				}
			}

			return {
				...player,
				position: [newX, py, newZ] as [number, number, number],
				rotation: newRotation,
				velocity: speed,
			};
		});

		// Update store with new positions and any new cannonballs
		if (newCannonballs.length > 0) {
			useGameStore.setState({
				otherPlayers: updatedPlayers,
				cannonballs: [...cannonballs, ...newCannonballs],
			});
		} else {
			useGameStore.setState({ otherPlayers: updatedPlayers });
		}
	});
}
