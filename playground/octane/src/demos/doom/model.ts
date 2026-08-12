export const FIXED_STEP_MS = 1000 / 60;
export const PLAYER_STEP = 0.09;
export const PLAYER_HEIGHT = 1;
export const PLAYER_PROJECTILE_STEP = 0.8;
export const FIRE_COOLDOWN_MS = 650;
export const WEAPON_ANIMATION_MS = 350;
export const ENEMY_DIRECTION_MS = 3000;
export const ENEMY_FIRE_COOLDOWN_MS = 1000;
export const ENEMY_DEATH_MS = 1000;

export type Point = { x: number; z: number };
export type EnemyState = Point & {
	id: number;
	direction: number;
	nextDirectionAt: number;
	lastShotAt: number;
	deathStartedAt: number | null;
	dead: boolean;
};
export type PickupState = Point & { id: number; visible: boolean };
export type ProjectileState = Point & {
	id: number;
	dx: number;
	dz: number;
	owner: 'player' | 'enemy';
};
export type GameState = {
	now: number;
	player: Point & { y: 1; yaw: number };
	enemies: EnemyState[];
	pickups: PickupState[];
	projectiles: ProjectileState[];
	lastPlayerShotAt: number;
	weaponUntil: number;
	nextProjectileId: number;
	lastCollectedId: number | null;
	audioEvents: Array<'fire' | 'pickup' | 'death'>;
};
export type InputState = {
	forward: boolean;
	backward: boolean;
	left: boolean;
	right: boolean;
	fire: boolean;
};

const perimeterCells = (): Point[] => {
	const cells: Point[] = [];
	for (let index = 0; index <= 80; index++) {
		const coordinate = -10 + index * 0.25;
		cells.push({ x: coordinate, z: -10 }, { x: coordinate, z: 10 });
	}
	for (let index = 1; index < 80; index++) {
		const coordinate = -10 + index * 0.25;
		cells.push({ x: -10, z: coordinate }, { x: 10, z: coordinate });
	}
	return cells;
};

// The compatibility oracle exposes 328 blocking wall cells. Collision uses
// these semantic grid cells independently from the instanced visualization.
export const WALL_CELLS: readonly Point[] = [
	...perimeterCells(),
	{ x: -6, z: -3 },
	{ x: -5, z: -3 },
	{ x: -4, z: -3 },
	{ x: -3, z: -3 },
	{ x: 4, z: 5 },
	{ x: 5, z: 5 },
	{ x: 6, z: 5 },
	{ x: 7, z: 5 },
];
export const BLOCKING_PROP: Point = { x: -2, z: 2 };

const ENEMY_STARTS: readonly Point[] = [
	{ x: -6, z: -6 },
	{ x: 6, z: -5 },
	{ x: -6, z: 5 },
	{ x: 6, z: 7 },
	{ x: 1, z: 7 },
];
const PICKUP_STARTS: readonly Point[] = [
	{ x: -8, z: -7 },
	{ x: -3, z: -7 },
	{ x: 3, z: -7 },
	{ x: 8, z: -7 },
	{ x: -8, z: 0 },
	{ x: -3, z: 1 },
	{ x: 4, z: 0 },
	{ x: 8, z: 1 },
	{ x: -7, z: 8 },
	{ x: -2, z: 8 },
	{ x: 7, z: 8 },
];

export function createGameState(): GameState {
	return {
		now: 0,
		player: { x: 2, y: 1, z: 2, yaw: 0 },
		enemies: ENEMY_STARTS.map((point, id) => ({
			...point,
			id,
			direction: id * 1.256,
			nextDirectionAt: ENEMY_DIRECTION_MS,
			lastShotAt: -ENEMY_FIRE_COOLDOWN_MS,
			deathStartedAt: null,
			dead: false,
		})),
		pickups: PICKUP_STARTS.map((point, id) => ({ ...point, id, visible: true })),
		projectiles: [],
		lastPlayerShotAt: -FIRE_COOLDOWN_MS,
		weaponUntil: 0,
		nextProjectileId: 1,
		lastCollectedId: null,
		audioEvents: [],
	};
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a: Point, b: Point, radius: number) => distance(a, b) < radius;
const cellBlocks = (point: Point, radius: number) =>
	WALL_CELLS.some((wall) => near(point, wall, radius));

export function isBlocked(state: GameState, point: Point, includeEnemies = true): boolean {
	if (cellBlocks(point, 1.5) || near(point, BLOCKING_PROP, 1.5)) return true;
	return includeEnemies && state.enemies.some((enemy) => near(point, enemy, 1.5));
}

export function enemyCanOccupy(state: GameState, point: Point): boolean {
	return (
		!cellBlocks(point, 1.5) && !near(point, BLOCKING_PROP, 1.5) && !near(point, state.player, 1.5)
	);
}

export function hasGridLineOfSight(from: Point, to: Point): boolean {
	const length = distance(from, to);
	const samples = Math.max(1, Math.ceil(length * 4));
	for (let index = 1; index < samples; index++) {
		const amount = index / samples;
		if (
			cellBlocks(
				{ x: from.x + (to.x - from.x) * amount, z: from.z + (to.z - from.z) * amount },
				0.5,
			)
		)
			return false;
	}
	return true;
}

function deterministicDirection(enemyId: number, now: number): number {
	const value =
		Math.sin((enemyId + 1) * 91.731 + Math.floor(now / ENEMY_DIRECTION_MS) * 47.23) * 43758.5453;
	return (value - Math.floor(value)) * Math.PI * 2;
}

export function turnPlayer(state: GameState, deltaYaw: number): GameState {
	return { ...state, player: { ...state.player, yaw: state.player.yaw + deltaYaw } };
}

export function stepGame(previous: GameState, input: InputState, now: number): GameState {
	let state: GameState = {
		...previous,
		now,
		audioEvents: [],
		player: { ...previous.player },
		enemies: previous.enemies.map((enemy) => ({ ...enemy })),
		pickups: previous.pickups.map((pickup) => ({ ...pickup })),
		projectiles: previous.projectiles.map((projectile) => ({ ...projectile })),
	};

	let forward = Number(input.forward) - Number(input.backward);
	let strafe = Number(input.right) - Number(input.left);
	const magnitude = Math.hypot(forward, strafe);
	if (magnitude > 0) {
		forward /= magnitude;
		strafe /= magnitude;
	}
	const sin = Math.sin(state.player.yaw);
	const cos = Math.cos(state.player.yaw);
	const candidate = {
		x: state.player.x + (sin * forward + cos * strafe) * PLAYER_STEP,
		z: state.player.z + (-cos * forward + sin * strafe) * PLAYER_STEP,
	};
	if (!isBlocked(state, candidate)) Object.assign(state.player, candidate);

	if (input.fire && now - state.lastPlayerShotAt >= FIRE_COOLDOWN_MS) {
		state.lastPlayerShotAt = now;
		state.weaponUntil = now + WEAPON_ANIMATION_MS;
		state.projectiles = state.projectiles.filter((projectile) => projectile.owner !== 'player');
		state.projectiles.push({
			id: state.nextProjectileId++,
			owner: 'player',
			x: state.player.x + sin,
			z: state.player.z - cos,
			dx: sin,
			dz: -cos,
		});
		state.audioEvents.push('fire');
	}

	for (const enemy of state.enemies) {
		if (enemy.deathStartedAt !== null) {
			if (now - enemy.deathStartedAt >= ENEMY_DEATH_MS) enemy.dead = true;
			continue;
		}
		const playerDistance = distance(enemy, state.player);
		const aggro = playerDistance < 15 && hasGridLineOfSight(enemy, state.player);
		if (aggro) {
			if (playerDistance > 2) {
				const dx = (state.player.x - enemy.x) * 0.0075;
				const dz = (state.player.z - enemy.z) * 0.0075;
				const next = { x: enemy.x + dx, z: enemy.z + dz };
				if (enemyCanOccupy(state, next)) Object.assign(enemy, next);
			}
			if (now - enemy.lastShotAt >= ENEMY_FIRE_COOLDOWN_MS) {
				enemy.lastShotAt = now;
				const dx = state.player.x - enemy.x;
				const dz = state.player.z - enemy.z;
				state.projectiles.push({
					id: state.nextProjectileId++,
					owner: 'enemy',
					x: enemy.x,
					z: enemy.z,
					dx,
					dz,
				});
				state.audioEvents.push('fire');
			}
		} else {
			if (now >= enemy.nextDirectionAt) {
				enemy.direction = deterministicDirection(enemy.id, now);
				enemy.nextDirectionAt = now + ENEMY_DIRECTION_MS;
			}
			const next = {
				x: enemy.x + Math.sin(enemy.direction) * 0.025,
				z: enemy.z + Math.cos(enemy.direction) * 0.025,
			};
			if (enemyCanOccupy(state, next)) Object.assign(enemy, next);
		}
	}

	const surviving: ProjectileState[] = [];
	for (const projectile of state.projectiles) {
		const speed = projectile.owner === 'player' ? PLAYER_PROJECTILE_STEP : 0.075;
		projectile.x += projectile.dx * speed;
		projectile.z += projectile.dz * speed;
		if (cellBlocks(projectile, 0.8)) continue;
		if (projectile.owner === 'player') {
			const victim = state.enemies.find(
				(enemy) => !enemy.dead && distance(enemy, projectile) <= 0.8,
			);
			if (victim) {
				victim.deathStartedAt = now;
				state.audioEvents.push('death');
				continue;
			}
		} else if (distance(projectile, state.player) <= 0.8) {
			// Oracle parity: the hit is consumed, but the player has no health or damage state.
			continue;
		}
		surviving.push(projectile);
	}
	state.projectiles = surviving;

	const collected = state.pickups.find((pickup) => pickup.visible && near(pickup, state.player, 1));
	if (collected) {
		// Deliberately preserve the observed restoration quirk: the immediately prior item returns.
		if (state.lastCollectedId !== null) {
			const prior = state.pickups.find((pickup) => pickup.id === state.lastCollectedId);
			if (prior) prior.visible = true;
		}
		collected.visible = false;
		state.lastCollectedId = collected.id;
		state.audioEvents.push('pickup');
	}
	return state;
}

export function semanticSnapshot(state: GameState) {
	return Object.freeze({
		now: state.now,
		player: Object.freeze({
			x: state.player.x,
			y: state.player.y,
			z: state.player.z,
			yaw: state.player.yaw,
		}),
		enemies: Object.freeze(
			state.enemies.map((enemy) =>
				Object.freeze({
					id: enemy.id,
					x: enemy.x,
					z: enemy.z,
					dead: enemy.dead,
					dying: enemy.deathStartedAt !== null && !enemy.dead,
				}),
			),
		),
		collectibles: Object.freeze(
			state.pickups.map((pickup) =>
				Object.freeze({ id: pickup.id, x: pickup.x, z: pickup.z, visible: pickup.visible }),
			),
		),
		projectiles: Object.freeze(
			state.projectiles.map((projectile) =>
				Object.freeze({
					id: projectile.id,
					x: projectile.x,
					z: projectile.z,
					owner: projectile.owner,
				}),
			),
		),
		weaponFiring: state.now < state.weaponUntil,
	});
}
