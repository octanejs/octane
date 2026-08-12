import { describe, expect, it } from 'vitest';
import {
	BLOCKING_PROP,
	createGameState,
	ENEMY_DEATH_MS,
	ENEMY_DIRECTION_MS,
	ENEMY_FIRE_COOLDOWN_MS,
	enemyCanOccupy,
	FIRE_COOLDOWN_MS,
	isBlocked,
	PLAYER_PROJECTILE_STEP,
	PLAYER_STEP,
	stepGame,
	WALL_CELLS,
	WEAPON_ANIMATION_MS,
} from './model.js';

const idle = { forward: false, backward: false, left: false, right: false, fire: false };

describe('Doom fixed-step model', () => {
	it('starts with the exact semantic population and no invented player systems', () => {
		const state = createGameState();
		expect(state.enemies).toHaveLength(5);
		expect(state.pickups).toHaveLength(11);
		expect(WALL_CELLS).toHaveLength(328);
		expect(state.player).toMatchObject({ x: 2, y: 1, z: 2 });
		expect(state).not.toHaveProperty('health');
		expect(state).not.toHaveProperty('score');
		expect(state).not.toHaveProperty('ammo');
	});

	it('moves exactly 0.09 and normalizes diagonals', () => {
		const start = createGameState();
		const straight = stepGame(start, { ...idle, forward: true }, 1);
		const diagonal = stepGame(start, { ...idle, forward: true, right: true }, 1);
		expect(
			Math.hypot(straight.player.x - start.player.x, straight.player.z - start.player.z),
		).toBeCloseTo(PLAYER_STEP, 8);
		expect(
			Math.hypot(diagonal.player.x - start.player.x, diagonal.player.z - start.player.z),
		).toBeCloseTo(PLAYER_STEP, 8);
	});

	it('aligns forward motion and shots with player yaw (Three camera uses -yaw)', () => {
		const state = createGameState();
		state.player.yaw = Math.PI / 2;
		const moved = stepGame(state, { ...idle, forward: true }, 1);
		expect(moved.player.x - state.player.x).toBeCloseTo(PLAYER_STEP, 8);
		expect(moved.player.z - state.player.z).toBeCloseTo(0, 8);
		const fired = stepGame(state, { ...idle, fire: true }, 0);
		const shot = fired.projectiles.find((projectile) => projectile.owner === 'player')!;
		expect(shot.dx).toBeCloseTo(1, 8);
		expect(shot.dz).toBeCloseTo(0, 8);
	});

	it('retains one player projectile and enforces fire and weapon schedules', () => {
		const first = stepGame(createGameState(), { ...idle, fire: true }, 0);
		expect(first.projectiles.filter((shot) => shot.owner === 'player')).toHaveLength(1);
		expect(first.weaponUntil).toBe(WEAPON_ANIMATION_MS);
		const tooSoon = stepGame(first, { ...idle, fire: true }, FIRE_COOLDOWN_MS - 1);
		expect(tooSoon.nextProjectileId).toBe(first.nextProjectileId);
		const again = stepGame(tooSoon, { ...idle, fire: true }, FIRE_COOLDOWN_MS);
		expect(again.projectiles.filter((shot) => shot.owner === 'player')).toHaveLength(1);
		expect(again.nextProjectileId).toBe(first.nextProjectileId + 1);
		expect(PLAYER_PROJECTILE_STEP).toBe(0.8);
		expect(tooSoon.weaponUntil).toBe(WEAPON_ANIMATION_MS);
	});

	it('turns one hit into a 1000ms death and collidable corpse', () => {
		const state = createGameState();
		state.player.x = state.enemies[0]!.x;
		state.player.z = state.enemies[0]!.z + 2;
		state.player.yaw = 0;
		const hit = stepGame(state, { ...idle, fire: true }, 0);
		expect(hit.enemies[0]!.deathStartedAt).toBe(0);
		expect(hit.enemies[0]!.dead).toBe(false);
		const corpse = stepGame(hit, idle, ENEMY_DEATH_MS);
		expect(corpse.enemies[0]!.dead).toBe(true);
	});

	it('replays death feedback and restarts death timing on a repeated hit', () => {
		const state = createGameState();
		const enemy = state.enemies[0]!;
		enemy.deathStartedAt = 0;
		state.projectiles = [{ id: 9, owner: 'player', x: enemy.x, z: enemy.z + 0.8, dx: 0, dz: 0 }];
		const repeated = stepGame(state, idle, ENEMY_DEATH_MS - 1);
		expect(repeated.enemies[0]!.deathStartedAt).toBe(ENEMY_DEATH_MS - 1);
		expect(repeated.audioEvents).toContain('death');
		expect(stepGame(repeated, idle, ENEMY_DEATH_MS).enemies[0]!.dead).toBe(false);
	});

	it('uses the contract collision radii at their boundaries', () => {
		const state = createGameState();
		expect(isBlocked(state, { x: BLOCKING_PROP.x + 1.49, z: BLOCKING_PROP.z }, false)).toBe(true);
		expect(isBlocked(state, { x: BLOCKING_PROP.x + 1.5, z: BLOCKING_PROP.z }, false)).toBe(false);
		const enemy = state.enemies[0]!;
		state.projectiles = [{ id: 7, owner: 'player', x: enemy.x, z: enemy.z + 0.8, dx: 0, dz: 0 }];
		expect(stepGame(state, idle, 1).enemies[0]!.deathStartedAt).toBe(1);
	});

	it('uses exact idle, chase, and raw enemy projectile schedules', () => {
		const idleState = createGameState();
		idleState.player = { x: 100, y: 1, z: 100, yaw: 0 };
		const idleEnemy = idleState.enemies[0]!;
		idleEnemy.x = -6;
		idleEnemy.z = 0;
		idleEnemy.direction = Math.PI / 2;
		const wandered = stepGame(idleState, idle, ENEMY_DIRECTION_MS - 1);
		expect(wandered.enemies[0]!.x - idleEnemy.x).toBeCloseTo(0.025, 8);

		const chaseState = createGameState();
		const chaseEnemy = chaseState.enemies[0]!;
		chaseEnemy.x = 2;
		chaseEnemy.z = -3;
		chaseEnemy.lastShotAt = -ENEMY_FIRE_COOLDOWN_MS;
		const chased = stepGame(chaseState, idle, 0);
		expect(chased.enemies[0]!.z - chaseEnemy.z).toBeCloseTo(5 * 0.0075, 8);
		const shot = chased.projectiles.find((projectile) => projectile.owner === 'enemy')!;
		const postChaseDisplacement = chaseState.player.z - chased.enemies[0]!.z;
		expect(shot.z).toBeCloseTo(chased.enemies[0]!.z + postChaseDisplacement * 0.075, 8);
	});

	it('keeps idle enemies outside the player solid radius so movement cannot soft-lock', () => {
		const state = createGameState();
		state.player = { x: 0, y: 1, z: 0, yaw: 0 };
		expect(enemyCanOccupy(state, { x: 1.49, z: 0 })).toBe(false);
		expect(enemyCanOccupy(state, { x: 1.5, z: 0 })).toBe(true);
		// Candidate idle step from the origin toward -x is inside the solid radius.
		expect(enemyCanOccupy(state, { x: -0.025, z: 0 })).toBe(false);

		// Idle wander only runs without aggro; keep the player far and confirm the
		// branch still steps when the solid-radius guard allows it.
		state.player = { x: 100, y: 1, z: 100, yaw: 0 };
		expect(enemyCanOccupy(state, { x: -0.025, z: 0 })).toBe(true);
		const enemy = state.enemies[0]!;
		enemy.x = 0;
		enemy.z = 0;
		enemy.direction = -Math.PI / 2;
		enemy.nextDirectionAt = ENEMY_DIRECTION_MS;
		const wandered = stepGame(state, idle, 1);
		expect(wandered.enemies[0]!.x - enemy.x).toBeCloseTo(-0.025, 8);
	});

	it('preserves the collectible restoration quirk', () => {
		const state = createGameState();
		state.player.x = state.pickups[0]!.x;
		state.player.z = state.pickups[0]!.z;
		const one = stepGame(state, idle, 1);
		expect(one.pickups[0]!.visible).toBe(false);
		one.player.x = one.pickups[1]!.x;
		one.player.z = one.pickups[1]!.z;
		const two = stepGame(one, idle, 2);
		expect(two.pickups[0]!.visible).toBe(true);
		expect(two.pickups[1]!.visible).toBe(false);
	});

	it('consumes enemy hits without adding player damage consequences', () => {
		const state = createGameState();
		state.projectiles.push({
			id: 80,
			owner: 'enemy',
			x: state.player.x,
			z: state.player.z + 0.1,
			dx: 0,
			dz: -1,
		});
		const after = stepGame(state, idle, 1);
		expect(after.projectiles.some((shot) => shot.id === 80)).toBe(false);
		expect(after).not.toHaveProperty('health');
	});
});
