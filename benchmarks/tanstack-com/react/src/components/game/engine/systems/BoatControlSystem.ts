import { useGameStore } from '../../hooks/useGameStore';
import { findNearestIsland } from '../../utils/islandGenerator';
import { checkIslandCollision, checkRockCollision } from '../../utils/collision';
import { getPointerState } from '../../ui/TouchControls';

import type { ShipStats } from '../../utils/upgrades';

// Base speed increased - coins no longer affect speed
const BASE_BOAT_SPEED = 8;
const BASE_REVERSE_SPEED = 4;
const BASE_TURN_SPEED = 2.2;
const DRAG = 0.96;
const BASE_ACCELERATION = 0.15;
const BOAT_RADIUS = 0.8;

function getMaxSpeed(
	isReverse: boolean,
	hasSpeedBoost: boolean,
	shipStats: ShipStats,
	permSpeedBoosts: number,
): number {
	// Base speed, no longer affected by coins
	let speed = isReverse ? BASE_REVERSE_SPEED : BASE_BOAT_SPEED;
	// Apply sail speed upgrade multiplier
	speed *= shipStats.sailSpeed;
	// Apply purchased permanent speed boosts (+10% each)
	speed *= Math.pow(1.1, permSpeedBoosts);
	// Apply speed boost from shop item
	return hasSpeedBoost ? speed * 2 : speed;
}

function getTargetAngleFromPointer(pointerX: number, pointerY: number): number {
	const centerX = window.innerWidth / 2;
	const centerY = window.innerHeight / 2;
	const dx = pointerX - centerX;
	const dy = pointerY - centerY;
	const screenAngle = Math.atan2(-dx, -dy);
	const cameraOffset = -Math.PI * 0.75;
	const targetAngle = screenAngle + cameraOffset;
	return Math.atan2(Math.sin(targetAngle), Math.cos(targetAngle));
}

function angleDifference(target: number, current: number): number {
	let diff = target - current;
	while (diff > Math.PI) diff -= Math.PI * 2;
	while (diff < -Math.PI) diff += Math.PI * 2;
	return diff;
}

export class BoatControlSystem {
	private spaceHeld = false;
	private boundKeyDown: (e: KeyboardEvent) => void;
	private boundKeyUp: (e: KeyboardEvent) => void;

	constructor() {
		this.boundKeyDown = this.handleKeyDown.bind(this);
		this.boundKeyUp = this.handleKeyUp.bind(this);
	}

	init(): void {
		window.addEventListener('keydown', this.boundKeyDown);
		window.addEventListener('keyup', this.boundKeyUp);
	}

	private handleKeyDown(e: KeyboardEvent): void {
		const {
			setMovingForward,
			setMovingBackward,
			setTurningLeft,
			setTurningRight,
			fireCannon,
			shipStats,
		} = useGameStore.getState();

		if (e.code === 'ArrowUp' || e.code === 'KeyW') {
			e.preventDefault();
			setMovingForward(true);
		}
		if (e.code === 'ArrowDown' || e.code === 'KeyS') {
			e.preventDefault();
			setMovingBackward(true);
		}
		if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
			e.preventDefault();
			setTurningLeft(true);
		}
		if (e.code === 'ArrowRight' || e.code === 'KeyD') {
			e.preventDefault();
			setTurningRight(true);
		}
		if (e.code === 'Space' && !e.repeat) {
			e.preventDefault();
			const { purchasedBoosts } = useGameStore.getState();
			// Track space held for gatling or rapid fire (auto-loader)
			if (shipStats.gatlingGuns || purchasedBoosts.rapidFire) {
				this.spaceHeld = true;
			}
			fireCannon();
		}
	}

	private handleKeyUp(e: KeyboardEvent): void {
		const { setMovingForward, setMovingBackward, setTurningLeft, setTurningRight } =
			useGameStore.getState();

		if (e.code === 'ArrowUp' || e.code === 'KeyW') {
			setMovingForward(false);
		}
		if (e.code === 'ArrowDown' || e.code === 'KeyS') {
			setMovingBackward(false);
		}
		if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
			setTurningLeft(false);
		}
		if (e.code === 'ArrowRight' || e.code === 'KeyD') {
			setTurningRight(false);
		}
		if (e.code === 'Space') {
			this.spaceHeld = false;
		}
	}

	update(delta: number): void {
		const state = useGameStore.getState();
		const {
			boatPosition,
			boatRotation,
			boatVelocity,
			isMovingForward,
			isMovingBackward,
			isTurningLeft,
			isTurningRight,
			islands,
			expandedIslands,
			showcaseIslands,
			cornerIslands,
			stage,
			rockColliders,
			shipStats,
			speedBoostEndTime,
			purchasedBoosts,
			setBoatPosition,
			setBoatRotation,
			setBoatVelocity,
			fireGatling,
		} = state;

		// Combine islands for collision in battle stage (includes partner, showcase, and corner islands)
		const allIslands =
			stage === 'battle'
				? [...islands, ...expandedIslands, ...showcaseIslands, ...cornerIslands]
				: islands;

		// Fire gatling while space is held
		if (this.spaceHeld && shipStats.gatlingGuns) {
			fireGatling();
		}

		// Fire side cannons while space is held (auto-loader)
		if (this.spaceHeld && purchasedBoosts.rapidFire) {
			const { fireCannon } = useGameStore.getState();
			fireCannon();
		}

		const dt = Math.min(delta, 0.1);

		const hasSpeedBoost = !!(speedBoostEndTime && Date.now() < speedBoostEndTime);
		const maxForwardSpeed = getMaxSpeed(false, hasSpeedBoost, shipStats, purchasedBoosts.permSpeed);
		const maxReverseSpeed = getMaxSpeed(true, hasSpeedBoost, shipStats, purchasedBoosts.permSpeed);

		// Apply upgrade multipliers + purchased permanent boosts
		const turnSpeed = BASE_TURN_SPEED * shipStats.turnRate;
		const acceleration =
			BASE_ACCELERATION * shipStats.acceleration * Math.pow(1.15, purchasedBoosts.permAccel);

		const pointer = getPointerState();

		let newRotation = boatRotation;
		let newVelocity = boatVelocity;

		if (pointer.active) {
			newVelocity = Math.min(newVelocity + acceleration, maxForwardSpeed);

			const targetAngle = getTargetAngleFromPointer(pointer.x, pointer.y);
			const angleDiff = angleDifference(targetAngle, boatRotation);
			const angleDiffDeg = Math.abs(angleDiff) * (180 / Math.PI);

			const stopThreshold = 1;
			const slowThreshold = 10;

			if (angleDiffDeg > stopThreshold) {
				let turnMultiplier = 1;
				if (angleDiffDeg < slowThreshold) {
					turnMultiplier = 0.2 + 0.8 * (angleDiffDeg / slowThreshold);
				}

				const turnAmount = turnSpeed * turnMultiplier * dt;
				if (angleDiff > 0) {
					newRotation += Math.min(turnAmount, angleDiff);
				} else {
					newRotation -= Math.min(turnAmount, -angleDiff);
				}
			}
		} else {
			if (isTurningLeft) {
				newRotation += turnSpeed * dt;
			}
			if (isTurningRight) {
				newRotation -= turnSpeed * dt;
			}

			if (isMovingForward) {
				newVelocity = Math.min(newVelocity + acceleration, maxForwardSpeed);
			} else if (isMovingBackward) {
				newVelocity = Math.max(newVelocity - acceleration, -maxReverseSpeed);
			} else {
				newVelocity *= DRAG;
				if (Math.abs(newVelocity) < 0.01) newVelocity = 0;
			}
		}

		// Movement
		const moveX = Math.sin(newRotation) * newVelocity * dt;
		const moveZ = Math.cos(newRotation) * newVelocity * dt;

		let newX = boatPosition[0] + moveX;
		let newZ = boatPosition[2] + moveZ;

		// Island collision (includes partner islands in battle stage)
		const islandCollision = checkIslandCollision(newX, newZ, allIslands, BOAT_RADIUS);
		if (islandCollision.collides) {
			newX += islandCollision.pushX;
			newZ += islandCollision.pushZ;
			newVelocity *= 0.92;
		}

		// Rock collision
		const rockCollision = checkRockCollision(newX, newZ, rockColliders, BOAT_RADIUS);
		if (rockCollision.collides) {
			newX += rockCollision.pushX;
			newZ += rockCollision.pushZ;
			newVelocity *= 0.88;
		}

		// Ship-to-ship collision (with AI ships)
		const { otherPlayers } = useGameStore.getState();
		const AI_SHIP_RADIUS = 1.2;
		for (const ship of otherPlayers) {
			const dx = newX - ship.position[0];
			const dz = newZ - ship.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);
			const minDist = BOAT_RADIUS + AI_SHIP_RADIUS;

			if (dist < minDist && dist > 0) {
				const overlap = minDist - dist;
				const pushStrength = overlap * 0.2;
				newX += (dx / dist) * pushStrength;
				newZ += (dz / dist) * pushStrength;
				newVelocity *= 0.85;
			}
		}

		// Second pass
		const islandCollision2 = checkIslandCollision(newX, newZ, allIslands, BOAT_RADIUS);
		if (islandCollision2.collides) {
			newX += islandCollision2.pushX * 0.5;
			newZ += islandCollision2.pushZ * 0.5;
		}

		const rockCollision2 = checkRockCollision(newX, newZ, rockColliders, BOAT_RADIUS);
		if (rockCollision2.collides) {
			newX += rockCollision2.pushX * 0.5;
			newZ += rockCollision2.pushZ * 0.5;
		}

		// Boundary handling
		const { worldBoundary, boundaryEdges, setBoundaryEdges } = useGameStore.getState();

		const BOUNDARY_THRESHOLD = 2;
		const atWest = newX <= -worldBoundary + BOUNDARY_THRESHOLD;
		const atEast = newX >= worldBoundary - BOUNDARY_THRESHOLD;
		const atSouth = newZ <= -worldBoundary + BOUNDARY_THRESHOLD;
		const atNorth = newZ >= worldBoundary - BOUNDARY_THRESHOLD;

		if (
			boundaryEdges.north !== atNorth ||
			boundaryEdges.south !== atSouth ||
			boundaryEdges.east !== atEast ||
			boundaryEdges.west !== atWest
		) {
			setBoundaryEdges({
				north: atNorth,
				south: atSouth,
				east: atEast,
				west: atWest,
			});
		}

		newX = Math.max(-worldBoundary, Math.min(worldBoundary, newX));
		newZ = Math.max(-worldBoundary, Math.min(worldBoundary, newZ));

		const newPosition: [number, number, number] = [newX, boatPosition[1], newZ];

		if (newRotation !== boatRotation) {
			setBoatRotation(newRotation);
		}
		if (newVelocity !== boatVelocity) {
			setBoatVelocity(newVelocity);
		}
		if (newX !== boatPosition[0] || newZ !== boatPosition[2]) {
			setBoatPosition(newPosition);
		}

		// Update nearby island detection (uses allIslands which includes partner islands in battle stage)
		const nearby = findNearestIsland(newPosition, allIslands, 10);
		const { nearbyIsland, discoveryProgress, setNearbyIsland, setDiscoveryProgress } =
			useGameStore.getState();

		if (nearby?.id !== nearbyIsland?.id) {
			setNearbyIsland(nearby);
			if (discoveryProgress > 0) {
				setDiscoveryProgress(0);
			}
		}
	}

	dispose(): void {
		window.removeEventListener('keydown', this.boundKeyDown);
		window.removeEventListener('keyup', this.boundKeyUp);
		this.spaceHeld = false;
	}
}
