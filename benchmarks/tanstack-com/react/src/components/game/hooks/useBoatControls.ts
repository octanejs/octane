import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from './useGameStore';
import { findNearestIsland } from '../utils/islandGenerator';
import { checkIslandCollision, checkRockCollision } from '../utils/collision';
import { getPointerState } from '../ui/TouchControls';

// Speed scales from MIN to MAX based on coins collected (0-100)
const MIN_BOAT_SPEED = 3;
const MAX_BOAT_SPEED = 10;
const MIN_REVERSE_SPEED = 1.5;
const MAX_REVERSE_SPEED = 5;
const TURN_SPEED = 2.2;
const DRAG = 0.96;
const ACCELERATION = 0.12;
const BOAT_RADIUS = 0.8;
const COIN_COLLECT_RADIUS = 1.5;
const MAX_COINS = 50;

// Calculate current max speed based on coins collected and active boosts
function getMaxSpeed(coinsCollected: number, isReverse: boolean, hasSpeedBoost: boolean): number {
	const ratio = Math.min(coinsCollected / MAX_COINS, 1);
	let speed: number;
	if (isReverse) {
		speed = MIN_REVERSE_SPEED + ratio * (MAX_REVERSE_SPEED - MIN_REVERSE_SPEED);
	} else {
		speed = MIN_BOAT_SPEED + ratio * (MAX_BOAT_SPEED - MIN_BOAT_SPEED);
	}
	// Double speed if boost is active
	return hasSpeedBoost ? speed * 2 : speed;
}

// Calculate target angle from pointer position
function getTargetAngleFromPointer(pointerX: number, pointerY: number): number {
	const centerX = window.innerWidth / 2;
	const centerY = window.innerHeight / 2;

	const dx = pointerX - centerX;
	const dy = pointerY - centerY;

	// Screen angle: 0 = up, positive = clockwise
	// Negate dx to fix left/right inversion
	const screenAngle = Math.atan2(-dx, -dy);

	// Camera offset: camera is at +X, +Z looking toward origin
	const cameraOffset = -Math.PI * 0.75;
	const targetAngle = screenAngle + cameraOffset;

	// Normalize to -PI to PI
	return Math.atan2(Math.sin(targetAngle), Math.cos(targetAngle));
}

// Calculate shortest angle difference, normalized to -PI to PI
function angleDifference(target: number, current: number): number {
	let diff = target - current;
	while (diff > Math.PI) diff -= Math.PI * 2;
	while (diff < -Math.PI) diff += Math.PI * 2;
	return diff;
}

export function useBoatControls() {
	// Get setters once via getState to avoid any subscriptions
	const {
		setBoatPosition,
		setBoatRotation,
		setBoatVelocity,
		setMovingForward,
		setMovingBackward,
		setTurningLeft,
		setTurningRight,
		setNearbyIsland,
		discoverIsland,
	} = useGameStore.getState();

	// Track if space is held for gatling
	const spaceHeldRef = useRef(false);

	// Keyboard controls - always attach, check phase inside handlers
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
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
			// Fire cannon with spacebar (only works in battle stage)
			// e.repeat is true when key is held down and auto-repeating
			if (e.code === 'Space' && !e.repeat) {
				e.preventDefault();
				const { shipStats, fireCannon } = useGameStore.getState();
				// Only set held ref if gatling is unlocked (for continuous fire)
				if (shipStats.gatlingGuns) {
					spaceHeldRef.current = true;
				}
				// Fire side cannons on initial press only
				fireCannon();
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
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
				spaceHeldRef.current = false;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			spaceHeldRef.current = false;
		};
	}, [setMovingForward, setMovingBackward, setTurningLeft, setTurningRight]);

	// Physics update
	useFrame((_, delta) => {
		// Read all volatile state directly from store to avoid re-renders
		const {
			phase,
			boatPosition,
			boatRotation,
			boatVelocity,
			isMovingForward,
			isMovingBackward,
			isTurningLeft,
			isTurningRight,
			islands,
			expandedIslands,
			stage,
			rockColliders,
			coins,
			coinsCollected,
			collectCoin,
			shipStats,
			fireGatling,
			speedBoostEndTime,
		} = useGameStore.getState();

		if (phase !== 'playing') return;

		// Combine islands for collision in battle stage (includes partner islands)
		const allIslands = stage === 'battle' ? [...islands, ...expandedIslands] : islands;

		// Fire gatling while space is held (if unlocked)
		if (spaceHeldRef.current && shipStats.gatlingGuns) {
			fireGatling();
		}

		const dt = Math.min(delta, 0.1);

		// Calculate max speeds based on coins collected
		const hasSpeedBoost = !!(speedBoostEndTime && Date.now() < speedBoostEndTime);
		const maxForwardSpeed = getMaxSpeed(coinsCollected, false, hasSpeedBoost);
		const maxReverseSpeed = getMaxSpeed(coinsCollected, true, hasSpeedBoost);

		// Check for pointer-based controls
		const pointer = getPointerState();

		let newRotation = boatRotation;
		let newVelocity = boatVelocity;

		if (pointer.active) {
			// Pointer is down - always accelerate forward
			newVelocity = Math.min(newVelocity + ACCELERATION, maxForwardSpeed);

			// Calculate target angle and turn toward it
			const targetAngle = getTargetAngleFromPointer(pointer.x, pointer.y);
			const angleDiff = angleDifference(targetAngle, boatRotation);
			const angleDiffDeg = Math.abs(angleDiff) * (180 / Math.PI);

			// Thresholds
			const stopThreshold = 1; // degrees - stop turning
			const slowThreshold = 10; // degrees - start slowing turn

			if (angleDiffDeg > stopThreshold) {
				// Calculate turn rate - full speed far away, slower when close
				let turnMultiplier = 1;
				if (angleDiffDeg < slowThreshold) {
					// Lerp from 0.2 to 1 based on angle
					turnMultiplier = 0.2 + 0.8 * (angleDiffDeg / slowThreshold);
				}

				// Turn toward target
				const turnAmount = TURN_SPEED * turnMultiplier * dt;
				if (angleDiff > 0) {
					newRotation += Math.min(turnAmount, angleDiff);
				} else {
					newRotation -= Math.min(turnAmount, -angleDiff);
				}
			}
		} else {
			// Keyboard controls
			if (isTurningLeft) {
				newRotation += TURN_SPEED * dt;
			}
			if (isTurningRight) {
				newRotation -= TURN_SPEED * dt;
			}

			// Acceleration / deceleration
			if (isMovingForward) {
				newVelocity = Math.min(newVelocity + ACCELERATION, maxForwardSpeed);
			} else if (isMovingBackward) {
				newVelocity = Math.max(newVelocity - ACCELERATION, -maxReverseSpeed);
			} else {
				// Apply drag
				newVelocity *= DRAG;
				if (Math.abs(newVelocity) < 0.01) newVelocity = 0;
			}
		}

		// Check for coin collection
		for (const coin of coins) {
			if (coin.collected) continue;
			const dx = boatPosition[0] - coin.position[0];
			const dz = boatPosition[2] - coin.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < COIN_COLLECT_RADIUS) {
				collectCoin(coin.id);
			}
		}

		// Movement
		const moveX = Math.sin(newRotation) * newVelocity * dt;
		const moveZ = Math.cos(newRotation) * newVelocity * dt;

		let newX = boatPosition[0] + moveX;
		let newZ = boatPosition[2] + moveZ;

		// Check island collision - apply gentle repulsion (includes partner islands)
		const islandCollision = checkIslandCollision(newX, newZ, allIslands, BOAT_RADIUS);
		if (islandCollision.collides) {
			newX += islandCollision.pushX;
			newZ += islandCollision.pushZ;
			// Gradually slow down when colliding
			newVelocity *= 0.92;
		}

		// Check rock collision - apply gentle repulsion
		const rockCollision = checkRockCollision(newX, newZ, rockColliders, BOAT_RADIUS);
		if (rockCollision.collides) {
			newX += rockCollision.pushX;
			newZ += rockCollision.pushZ;
			// Gradually slow down when colliding
			newVelocity *= 0.88;
		}

		// Second pass - check again after push to prevent getting stuck
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

		// Get dynamic world boundary from store
		const { worldBoundary, boundaryEdges, setBoundaryEdges } = useGameStore.getState();

		// Clamp to world boundary and detect which edges are hit
		const BOUNDARY_THRESHOLD = 2; // How close to boundary to show wall
		const atWest = newX <= -worldBoundary + BOUNDARY_THRESHOLD;
		const atEast = newX >= worldBoundary - BOUNDARY_THRESHOLD;
		const atSouth = newZ <= -worldBoundary + BOUNDARY_THRESHOLD;
		const atNorth = newZ >= worldBoundary - BOUNDARY_THRESHOLD;

		// Update boundary edges if changed
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

		// Update state only if changed
		if (newRotation !== boatRotation) {
			setBoatRotation(newRotation);
		}
		if (newVelocity !== boatVelocity) {
			setBoatVelocity(newVelocity);
		}
		if (newX !== boatPosition[0] || newZ !== boatPosition[2]) {
			setBoatPosition(newPosition);
		}

		// Check for nearby islands (uses allIslands which includes partner islands in battle stage)
		const nearby = findNearestIsland(newPosition, allIslands, 10);
		const { nearbyIsland, discoveryProgress, discoveredIslands, setDiscoveryProgress } =
			useGameStore.getState();

		if (nearby?.id !== nearbyIsland?.id) {
			setNearbyIsland(nearby);
			// Reset progress when changing islands
			if (discoveryProgress > 0) {
				setDiscoveryProgress(0);
			}
		}

		// Discovery progress - stay near undiscovered island to discover it
		const DISCOVERY_RADIUS = 8; // Must be within this distance
		const DISCOVERY_TIME = 8; // Seconds to fully discover

		if (nearby && !discoveredIslands.has(nearby.id)) {
			const dist = Math.sqrt(
				(newPosition[0] - nearby.position[0]) ** 2 + (newPosition[2] - nearby.position[2]) ** 2,
			);

			if (dist < DISCOVERY_RADIUS) {
				// Accumulate progress
				const newProgress = Math.min(1, discoveryProgress + dt / DISCOVERY_TIME);
				setDiscoveryProgress(newProgress);

				// Discover when progress reaches 100%
				if (newProgress >= 1) {
					discoverIsland(nearby.id);
					setDiscoveryProgress(0);
				}
			} else {
				// Decay progress when outside radius (but slower than gain)
				if (discoveryProgress > 0) {
					const decayedProgress = Math.max(0, discoveryProgress - dt / (DISCOVERY_TIME * 2));
					setDiscoveryProgress(decayedProgress);
				}
			}
		}
	});
}
