import {
	useGameStore,
	type OtherPlayer,
	type Cannonball,
	type AIDifficulty,
} from '../../hooks/useGameStore';

// Ship colors by difficulty
const AI_COLORS_BY_DIFFICULTY: Record<AIDifficulty, string[]> = {
	easy: ['#2ecc71', '#1abc9c'], // Greens - friendly looking
	medium: ['#3498db', '#9b59b6'], // Blues/purples
	hard: ['#f39c12', '#e67e22'], // Oranges - warning
	elite: ['#e74c3c', '#c0392b'], // Reds - danger
	boss: ['#0f0f0f', '#1a0a0a'], // Near black with hint of blood red - terrifying
};

// Stats by difficulty (relative to player's max potential)
// Player max: 175 HP, ~300ms fire rate, dual cannons, double shot
// AI average should be 60-70% of player potential
interface AIStats {
	health: number;
	fireCooldown: number; // ms between shots
	speed: number;
	turnSpeed: number;
	accuracy: number; // 0-1, affects lead calculation
	aggroDistance: number;
	attackDistance: number;
}

const AI_STATS: Record<AIDifficulty, AIStats> = {
	// ~50% of player power
	easy: {
		health: 80,
		fireCooldown: 1300,
		speed: 5,
		turnSpeed: 1.8,
		accuracy: 0.3,
		aggroDistance: 45,
		attackDistance: 22,
	},
	// ~70% of player power
	medium: {
		health: 110,
		fireCooldown: 950,
		speed: 6,
		turnSpeed: 2.0,
		accuracy: 0.45,
		aggroDistance: 60,
		attackDistance: 28,
	},
	// ~85% of player power
	hard: {
		health: 140,
		fireCooldown: 700,
		speed: 7,
		turnSpeed: 2.4,
		accuracy: 0.6,
		aggroDistance: 75,
		attackDistance: 32,
	},
	// ~100% of player power
	elite: {
		health: 175,
		fireCooldown: 500,
		speed: 8,
		turnSpeed: 2.8,
		accuracy: 0.8,
		aggroDistance: 90,
		attackDistance: 38,
	},
	// Corner boss - tough but beatable
	boss: {
		health: 350,
		fireCooldown: 350, // Fast fire but not overwhelming
		speed: 10,
		turnSpeed: 4.0,
		accuracy: 0.9,
		aggroDistance: 30, // Tiny aggro range - must get close
		attackDistance: 25,
	},
};

// Difficulty distribution for base 6 AI ships (battle stage) - easier mix
const DIFFICULTY_DISTRIBUTION: AIDifficulty[] = [
	'easy',
	'easy',
	'easy',
	'medium',
	'medium',
	'hard',
];

// Difficulty distribution for outer rim AIs (showcase stage) - much tougher
const OUTER_RIM_DISTRIBUTION: AIDifficulty[] = [
	'hard',
	'hard',
	'elite',
	'elite',
	'elite',
	'elite',
	'elite',
	'elite',
];

// Territorial behavior
// Roam radius: how far AI will patrol from home
const ROAM_RADIUS = 35;
// Roam leash: hard limit before AI gets pulled back
const ROAM_LEASH = 50;
// Pull strength when outside roam radius
const ROAM_PULL_STRENGTH = 0.5;
// Min distance from center (keep AI away from starting area)
const MIN_CENTER_DISTANCE = 60;

// Outer rim AI territorial behavior (larger but still bounded)
const OUTER_RIM_ROAM_RADIUS = 80;
const OUTER_RIM_ROAM_LEASH = 120;

// Corner boss AI territorial behavior (very tight, protect the island)
const CORNER_BOSS_ROAM_RADIUS = 8;
const CORNER_BOSS_ROAM_LEASH = 60; // Hard leash - boss MUST return if beyond this
const BOSS_DEAGGRO_DISTANCE = 50; // Boss gives up chase if player gets this far

// Corner positions (right at the corners)
const CORNER_POSITIONS: Array<[number, number]> = [
	[480, 480], // NE
	[-480, 480], // NW
	[-480, -480], // SW
	[480, -480], // SE
];

// Combat
const AI_OPTIMAL_DISTANCE = 12; // Distance AI tries to maintain while circling
const AI_LEAD_FACTOR = 0.5;

// Avoidance
const AI_AVOID_DISTANCE = 8;
const BOUNDARY_MARGIN = 15;

// Battle world boundary
const BATTLE_WORLD_BOUNDARY = 180;

// Export for debug visualization
export { ROAM_RADIUS, ROAM_LEASH, OUTER_RIM_ROAM_LEASH, CORNER_BOSS_ROAM_LEASH };

interface AIState {
	homePosition: [number, number];
	patrolAngle: number;
	patrolTimer: number;
	lastFireTime: number;
	circleDirection: 1 | -1;
	difficulty: AIDifficulty;
	stats: AIStats;
	isOuterRim: boolean;
	roamRadius: number;
	roamLeash: number;
}

// Outer rim boundary for showcase stage AIs
const OUTER_RIM_BOUNDARY = 450;

function generateAIOpponents(
	count: number,
	outerRim = false,
	startIndex = 0,
): {
	opponents: OtherPlayer[];
	states: Map<string, AIState>;
} {
	const opponents: OtherPlayer[] = [];
	const states = new Map<string, AIState>();

	const boundary = outerRim ? OUTER_RIM_BOUNDARY : BATTLE_WORLD_BOUNDARY;
	const distribution = outerRim ? OUTER_RIM_DISTRIBUTION : DIFFICULTY_DISTRIBUTION;

	for (let i = 0; i < count; i++) {
		const sectorAngle = (i / count) * Math.PI * 2;
		// Spawn closer to edges (60-85% of boundary)
		const minRadius = boundary * 0.6;
		const maxRadius = boundary * 0.85;
		const radius = minRadius + Math.random() * (maxRadius - minRadius);

		const homeX = Math.cos(sectorAngle) * radius;
		const homeZ = Math.sin(sectorAngle) * radius;

		const startOffset = 10;
		const startX = homeX + (Math.random() - 0.5) * startOffset;
		const startZ = homeZ + (Math.random() - 0.5) * startOffset;

		const id = `ai-${startIndex + i}`;
		// Pick random difficulty from distribution
		const difficulty = distribution[Math.floor(Math.random() * distribution.length)];
		const stats = AI_STATS[difficulty];
		const colors = AI_COLORS_BY_DIFFICULTY[difficulty];
		const color = colors[Math.floor(Math.random() * colors.length)];

		opponents.push({
			id,
			isAI: true,
			position: [startX, 0, startZ],
			rotation: sectorAngle + Math.PI,
			velocity: stats.speed,
			boatType: 'ship',
			color,
			health: stats.health,
			maxHealth: stats.health,
			difficulty,
			homePosition: [homeX, homeZ],
		});

		states.set(id, {
			homePosition: [homeX, homeZ],
			patrolAngle: Math.random() * Math.PI * 2,
			patrolTimer: Math.random() * 5,
			lastFireTime: 0,
			circleDirection: Math.random() > 0.5 ? 1 : -1,
			difficulty,
			stats,
			isOuterRim: outerRim,
			roamRadius: outerRim ? OUTER_RIM_ROAM_RADIUS : ROAM_RADIUS,
			roamLeash: outerRim ? OUTER_RIM_ROAM_LEASH : ROAM_LEASH,
		});
	}

	return { opponents, states };
}

function generateCornerBosses(startIndex = 0): {
	opponents: OtherPlayer[];
	states: Map<string, AIState>;
} {
	const opponents: OtherPlayer[] = [];
	const states = new Map<string, AIState>();

	const stats = AI_STATS.boss;
	const colors = AI_COLORS_BY_DIFFICULTY.boss;

	for (let i = 0; i < CORNER_POSITIONS.length; i++) {
		const [homeX, homeZ] = CORNER_POSITIONS[i];

		const id = `boss-${startIndex + i}`;
		const color = colors[Math.floor(Math.random() * colors.length)];

		opponents.push({
			id,
			isAI: true,
			position: [homeX, 0, homeZ],
			rotation: Math.atan2(-homeX, -homeZ), // Face toward center
			velocity: stats.speed,
			boatType: 'ship',
			color,
			health: stats.health,
			maxHealth: stats.health,
			difficulty: 'boss',
			homePosition: [homeX, homeZ],
		});

		states.set(id, {
			homePosition: [homeX, homeZ],
			patrolAngle: Math.random() * Math.PI * 2,
			patrolTimer: Math.random() * 5,
			lastFireTime: 0,
			circleDirection: Math.random() > 0.5 ? 1 : -1,
			difficulty: 'boss',
			stats,
			isOuterRim: true,
			roamRadius: CORNER_BOSS_ROAM_RADIUS,
			roamLeash: CORNER_BOSS_ROAM_LEASH,
		});
	}

	return { opponents, states };
}

function createAICannonball(
	aiPosition: [number, number, number],
	aiRotation: number,
	targetPosition: [number, number, number],
	targetVelocity: [number, number],
	aiId: string,
	side: 'left' | 'right',
	accuracy: number,
): Cannonball {
	const sideMultiplier = side === 'right' ? 1 : -1;
	const cannonOffset = 0.5;
	const baseSpeed = 18;

	const perpX = Math.cos(aiRotation) * sideMultiplier;
	const perpZ = -Math.sin(aiRotation) * sideMultiplier;
	const fireX = aiPosition[0] + perpX * cannonOffset;
	const fireZ = aiPosition[2] + perpZ * cannonOffset;

	const dx = targetPosition[0] - fireX;
	const dz = targetPosition[2] - fireZ;
	const dist = Math.sqrt(dx * dx + dz * dz);

	const flightTime = dist / baseSpeed;

	// Apply accuracy to lead calculation (lower accuracy = less leading)
	const effectiveLead = AI_LEAD_FACTOR * accuracy;
	const leadX = targetPosition[0] + targetVelocity[0] * flightTime * effectiveLead;
	const leadZ = targetPosition[2] + targetVelocity[1] * flightTime * effectiveLead;

	// Add some randomness based on accuracy (lower accuracy = more spread)
	const spread = (1 - accuracy) * 8;
	const finalX = leadX + (Math.random() - 0.5) * spread;
	const finalZ = leadZ + (Math.random() - 0.5) * spread;

	const leadDx = finalX - fireX;
	const leadDz = finalZ - fireZ;
	const leadDist = Math.sqrt(leadDx * leadDx + leadDz * leadDz);

	const velX = (leadDx / leadDist) * baseSpeed;
	const velZ = (leadDz / leadDist) * baseSpeed;

	return {
		id: Date.now() + Math.random() * 1000,
		position: [fireX, 0.5, fireZ],
		velocity: [velX, 3, velZ],
		ownerId: aiId,
		createdAt: Date.now(),
	};
}

function normalizeAngle(angle: number): number {
	while (angle > Math.PI) angle -= Math.PI * 2;
	while (angle < -Math.PI) angle += Math.PI * 2;
	return angle;
}

export class AISystem {
	private aiStates: Map<string, AIState> = new Map();
	private initialized = false;
	private spawnCount = 0;
	private bossesSpawned = false;

	spawn(count: number, outerRim = false): void {
		if (!outerRim && this.initialized) return;

		const { opponents, states } = generateAIOpponents(count, outerRim, this.spawnCount);

		if (outerRim) {
			// Add to existing AIs
			const { otherPlayers } = useGameStore.getState();
			useGameStore.getState().setOtherPlayers([...otherPlayers, ...opponents]);
			states.forEach((state, id) => this.aiStates.set(id, state));
		} else {
			useGameStore.getState().setOtherPlayers(opponents);
			this.aiStates = states;
			this.initialized = true;
		}

		this.spawnCount += count;
	}

	spawnCornerBosses(): void {
		if (this.bossesSpawned) return;

		const { opponents, states } = generateCornerBosses(this.spawnCount);

		const { otherPlayers } = useGameStore.getState();
		useGameStore.getState().setOtherPlayers([...otherPlayers, ...opponents]);
		states.forEach((state, id) => this.aiStates.set(id, state));

		this.spawnCount += opponents.length;
		this.bossesSpawned = true;
	}

	getDebugTerritories(): Array<{
		homePosition: [number, number];
		color: string;
		id: string;
		leashRadius: number;
	}> {
		const { otherPlayers } = useGameStore.getState();
		const territories: Array<{
			homePosition: [number, number];
			color: string;
			id: string;
			leashRadius: number;
		}> = [];

		for (const player of otherPlayers) {
			if (!player.isAI) continue;
			const state = this.aiStates.get(player.id);
			if (state) {
				territories.push({
					homePosition: state.homePosition,
					color: player.color,
					id: player.id,
					leashRadius: state.roamLeash,
				});
			}
		}

		return territories;
	}

	update(delta: number): void {
		const state = useGameStore.getState();
		const {
			otherPlayers,
			boatPosition,
			boatRotation,
			boatVelocity,
			islands,
			expandedIslands,
			worldBoundary,
			cannonballs,
		} = state;

		const dt = Math.min(delta, 0.1);
		const newCannonballs: Cannonball[] = [];
		const allIslands = [...islands, ...expandedIslands];

		const playerVelX = Math.sin(boatRotation) * boatVelocity;
		const playerVelZ = Math.cos(boatRotation) * boatVelocity;

		const updatedPlayers = otherPlayers.map((player) => {
			if (!player.isAI) return player;

			let aiState = this.aiStates.get(player.id);
			if (!aiState) {
				const difficulty: AIDifficulty = player.difficulty || 'medium';
				aiState = {
					homePosition: [player.position[0], player.position[2]],
					patrolAngle: Math.random() * Math.PI * 2,
					patrolTimer: 0,
					lastFireTime: 0,
					circleDirection: 1,
					difficulty,
					stats: AI_STATS[difficulty],
					isOuterRim: false,
					roamRadius: ROAM_RADIUS,
					roamLeash: ROAM_LEASH,
				};
				this.aiStates.set(player.id, aiState);
			}

			const stats = aiState.stats;
			const aiRoamRadius = aiState.roamRadius;
			const aiRoamLeash = aiState.roamLeash;
			const [px, py, pz] = player.position;
			const [homeX, homeZ] = aiState.homePosition;

			const dxToPlayer = boatPosition[0] - px;
			const dzToPlayer = boatPosition[2] - pz;
			const distToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dzToPlayer * dzToPlayer);

			const dxToHome = homeX - px;
			const dzToHome = homeZ - pz;
			const distToHome = Math.sqrt(dxToHome * dxToHome + dzToHome * dzToHome);

			// Outer rim AIs have bigger aggro range, bosses use their base (small) aggro initially
			const isBoss = aiState.difficulty === 'boss';
			const aggroDistance = aiState.isOuterRim ? stats.aggroDistance * 1.5 : stats.aggroDistance;

			// Boss AI: once player enters initial aggro zone, boss pursues forever
			// Track if boss has been triggered (use patrolTimer as flag, -999 = triggered)
			const bossTriggered = isBoss && aiState.patrolTimer === -999;
			const shouldTriggerBoss = isBoss && distToPlayer < stats.aggroDistance;
			if (shouldTriggerBoss && !bossTriggered) {
				aiState.patrolTimer = -999; // Mark as triggered
			}

			// Boss de-aggros if player escapes far enough
			if (isBoss && bossTriggered && distToPlayer > BOSS_DEAGGRO_DISTANCE) {
				aiState.patrolTimer = Math.random() * 5; // Reset to patrol mode
			}

			const isAggro =
				(bossTriggered && distToPlayer <= BOSS_DEAGGRO_DISTANCE) ||
				shouldTriggerBoss ||
				distToPlayer < aggroDistance;
			const isInAttackRange = distToPlayer < stats.attackDistance;
			// Bosses also have a hard leash - they MUST return if too far from home
			const isBeyondLeash = distToHome > aiRoamLeash;
			const isTooFarFromHome = !isBoss && distToHome > aiRoamRadius && !isAggro;

			// Check if AI is too close to center (only for non-outer-rim AIs)
			const distFromCenter = Math.sqrt(px * px + pz * pz);
			const isTooCloseToCenter =
				!aiState.isOuterRim && !isBoss && distFromCenter < MIN_CENTER_DISTANCE;

			let targetAngle: number;
			let speed: number;

			if (isBeyondLeash) {
				targetAngle = Math.atan2(dxToHome, dzToHome);
				speed = stats.speed * 1.2;
			} else if (isTooCloseToCenter) {
				// Push away from center back toward home
				targetAngle = Math.atan2(dxToHome, dzToHome);
				speed = stats.speed * 1.1;
			} else if (isTooFarFromHome) {
				targetAngle = Math.atan2(dxToHome, dzToHome);
				speed = stats.speed;
			} else if (isInAttackRange) {
				const angleToPlayer = Math.atan2(dxToPlayer, dzToPlayer);

				if (distToPlayer < AI_OPTIMAL_DISTANCE - 2) {
					// Too close, back off while circling
					targetAngle = angleToPlayer + Math.PI + (aiState.circleDirection * Math.PI) / 3;
				} else if (distToPlayer > AI_OPTIMAL_DISTANCE + 4) {
					// Too far, approach more directly
					targetAngle = angleToPlayer + (aiState.circleDirection * Math.PI) / 6;
				} else {
					// Good distance, circle to get broadside angle
					targetAngle = angleToPlayer + (aiState.circleDirection * Math.PI) / 2.5;
				}

				// Bosses circle faster and closer
				speed = isBoss ? stats.speed * 0.9 : stats.speed * 0.85;
			} else if (isAggro) {
				targetAngle = Math.atan2(dxToPlayer, dzToPlayer);
				// Bosses pursue at full speed
				speed = isBoss ? stats.speed : stats.speed * 1.2;
			} else {
				aiState.patrolTimer -= dt;
				if (aiState.patrolTimer <= 0) {
					const homeAngle = Math.atan2(dxToHome, dzToHome);
					const randomOffset = (Math.random() - 0.5) * Math.PI;
					aiState.patrolAngle = homeAngle * ROAM_PULL_STRENGTH + randomOffset;
					aiState.patrolTimer = 3 + Math.random() * 4;
				}
				targetAngle = aiState.patrolAngle;
				speed = stats.speed * 0.7;
			}

			// Obstacle avoidance
			let avoidX = 0;
			let avoidZ = 0;

			if (px < -worldBoundary + BOUNDARY_MARGIN) avoidX += 1;
			if (px > worldBoundary - BOUNDARY_MARGIN) avoidX -= 1;
			if (pz < -worldBoundary + BOUNDARY_MARGIN) avoidZ += 1;
			if (pz > worldBoundary - BOUNDARY_MARGIN) avoidZ -= 1;

			for (const island of allIslands) {
				const dx = px - island.position[0];
				const dz = pz - island.position[2];
				const dist = Math.sqrt(dx * dx + dz * dz);
				const avoidRadius = island.scale * 3.5 + AI_AVOID_DISTANCE;

				if (dist < avoidRadius && dist > 0) {
					const strength = (avoidRadius - dist) / avoidRadius;
					avoidX += (dx / dist) * strength * 2;
					avoidZ += (dz / dist) * strength * 2;
				}
			}

			for (const other of otherPlayers) {
				if (other.id === player.id || !other.isAI) continue;
				const dx = px - other.position[0];
				const dz = pz - other.position[2];
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < 8 && dist > 0) {
					const strength = (8 - dist) / 8;
					avoidX += (dx / dist) * strength * 0.5;
					avoidZ += (dz / dist) * strength * 0.5;
				}
			}

			if (avoidX !== 0 || avoidZ !== 0) {
				const avoidAngle = Math.atan2(avoidX, avoidZ);
				const avoidStrength = Math.min(1, Math.sqrt(avoidX * avoidX + avoidZ * avoidZ));
				targetAngle = targetAngle * (1 - avoidStrength * 0.7) + avoidAngle * avoidStrength * 0.7;
			}

			let newRotation = player.rotation;
			const angleDiff = normalizeAngle(targetAngle - newRotation);

			const turnAmount = stats.turnSpeed * dt;
			if (Math.abs(angleDiff) > 0.02) {
				newRotation += Math.sign(angleDiff) * Math.min(turnAmount, Math.abs(angleDiff));
			}

			const moveX = Math.sin(newRotation) * speed * dt;
			const moveZ = Math.cos(newRotation) * speed * dt;

			let newX = px + moveX;
			let newZ = pz + moveZ;

			newX = Math.max(-worldBoundary + 3, Math.min(worldBoundary - 3, newX));
			newZ = Math.max(-worldBoundary + 3, Math.min(worldBoundary - 3, newZ));

			// Firing logic
			const now = Date.now();
			if (isInAttackRange && now - aiState.lastFireTime > stats.fireCooldown) {
				const angleToPlayerFromShip = Math.atan2(dxToPlayer, dzToPlayer);
				const relativeAngle = normalizeAngle(angleToPlayerFromShip - newRotation);
				const absRelAngle = Math.abs(relativeAngle);

				if (absRelAngle > Math.PI / 6 && absRelAngle < (5 * Math.PI) / 6) {
					const side = relativeAngle > 0 ? 'left' : 'right';
					newCannonballs.push(
						createAICannonball(
							[newX, py, newZ],
							newRotation,
							boatPosition,
							[playerVelX, playerVelZ],
							player.id,
							side,
							stats.accuracy,
						),
					);

					// Bosses fire from BOTH sides simultaneously
					if (aiState.difficulty === 'boss') {
						const otherSide = side === 'left' ? 'right' : 'left';
						newCannonballs.push(
							createAICannonball(
								[newX, py, newZ],
								newRotation,
								boatPosition,
								[playerVelX, playerVelZ],
								player.id,
								otherSide,
								stats.accuracy,
							),
						);
					}

					aiState.lastFireTime = now;

					if (Math.random() < 0.2) {
						aiState.circleDirection = aiState.circleDirection === 1 ? -1 : 1;
					}
				}
			}

			return {
				...player,
				position: [newX, py, newZ] as [number, number, number],
				rotation: newRotation,
				velocity: speed,
			};
		});

		if (newCannonballs.length > 0) {
			useGameStore.setState({
				otherPlayers: updatedPlayers,
				cannonballs: [...cannonballs, ...newCannonballs],
			});
		} else {
			useGameStore.setState({ otherPlayers: updatedPlayers });
		}
	}

	reset(): void {
		this.initialized = false;
		this.bossesSpawned = false;
		this.aiStates.clear();
		this.spawnCount = 0;
	}
}
