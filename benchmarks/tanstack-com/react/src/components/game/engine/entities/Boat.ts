import * as THREE from 'three';
import { modelLoader } from '../loaders/ModelLoader';
import { getWaveHeight } from './Ocean';
import type { BoatType } from '../../hooks/useGameStore';

interface WakeBubble {
	startX: number;
	startZ: number;
	vx: number; // velocity for spreading
	vz: number;
	size: number;
	birthTime: number;
	lifetime: number;
}

const BUBBLE_MAX_COUNT = 1000; // Buffer size, not a cap on active bubbles
const BUBBLE_Y = -0.35;

export class Boat {
	group: THREE.Group;
	private wakeGeometry: THREE.BufferGeometry;
	private wakeMesh: THREE.Points;
	private wakeMaterial: THREE.PointsMaterial;
	private boatModel: THREE.Group | null = null;
	private cannonGroup: THREE.Group | null = null;
	private boatType: BoatType = 'dinghy';
	private bubbles: WakeBubble[] = [];

	constructor() {
		this.group = new THREE.Group();

		// Wake particles (bubbles) - dynamic system
		const positions = new Float32Array(BUBBLE_MAX_COUNT * 3);
		const sizes = new Float32Array(BUBBLE_MAX_COUNT);
		const alphas = new Float32Array(BUBBLE_MAX_COUNT);

		this.wakeGeometry = new THREE.BufferGeometry();
		this.wakeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.wakeGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
		this.wakeGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

		// Create circular texture for bubbles
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 32;
		const ctx = canvas.getContext('2d')!;
		const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 32, 32);
		const circleTexture = new THREE.CanvasTexture(canvas);

		this.wakeMaterial = new THREE.PointsMaterial({
			color: '#FFFFFF',
			size: 0.3,
			transparent: true,
			opacity: 0.6,
			sizeAttenuation: true,
			map: circleTexture,
			depthWrite: false,
		});

		this.wakeMesh = new THREE.Points(this.wakeGeometry, this.wakeMaterial);
		this.wakeMesh.frustumCulled = false;
	}

	setBoatType(type: BoatType): void {
		if (type === this.boatType && this.boatModel) return;

		// Remove old model
		if (this.boatModel) {
			this.group.remove(this.boatModel);
			this.boatModel = null;
			this.cannonGroup = null;
		}

		this.boatType = type;

		if (type === 'dinghy') {
			const tint = new THREE.Color('#C4A484');
			this.boatModel = modelLoader.clone('/models/rowboat.glb', tint);
			this.boatModel.scale.setScalar(0.4);
			this.group.add(this.boatModel);
		} else {
			const tint = new THREE.Color('#FFEEDD');
			this.boatModel = modelLoader.clone('/models/ship.glb', tint);
			this.boatModel.scale.setScalar(0.28);
			this.group.add(this.boatModel);

			// Add cannon
			this.cannonGroup = new THREE.Group();
			this.cannonGroup.position.set(0.4, 0.3, 0);

			// Cannon base
			const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.06, 12);
			const baseMat = new THREE.MeshStandardMaterial({
				color: '#4a4a4a',
				metalness: 0.8,
				roughness: 0.3,
			});
			const base = new THREE.Mesh(baseGeo, baseMat);
			base.castShadow = true;
			this.cannonGroup.add(base);

			// Cannon barrel
			const barrelGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 12);
			const barrelMat = new THREE.MeshStandardMaterial({
				color: '#3a3a3a',
				metalness: 0.9,
				roughness: 0.2,
			});
			const barrel = new THREE.Mesh(barrelGeo, barrelMat);
			barrel.position.set(0.15, 0.02, 0);
			barrel.rotation.z = Math.PI / 2;
			barrel.castShadow = true;
			this.cannonGroup.add(barrel);

			// Cannon muzzle
			const muzzleGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.04, 12);
			const muzzleMat = new THREE.MeshStandardMaterial({
				color: '#2a2a2a',
				metalness: 0.9,
				roughness: 0.2,
			});
			const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
			muzzle.position.set(0.27, 0.02, 0);
			muzzle.rotation.z = Math.PI / 2;
			muzzle.castShadow = true;
			this.cannonGroup.add(muzzle);

			this.group.add(this.cannonGroup);
		}
	}

	update(
		time: number,
		position: [number, number, number],
		rotation: number,
		velocity: number,
	): void {
		const waveY = getWaveHeight(position[0], position[2], time);

		// Bobbing and tilting
		const isDinghy = this.boatType === 'dinghy';
		const bobY = Math.sin(time * (isDinghy ? 2.2 : 1.8)) * (isDinghy ? 0.05 : 0.03);
		const bobRoll = Math.sin(time * (isDinghy ? 1.8 : 1.5)) * (isDinghy ? 0.06 : 0.03);
		const bobPitch = Math.sin(time * (isDinghy ? 2.5 : 2.2)) * (isDinghy ? 0.04 : 0.02);

		// Wave-based tilting
		const offset = isDinghy ? 0.2 : 0.3;
		const waveTiltX = getWaveHeight(position[0] + offset, position[2], time) - waveY;
		const waveTiltZ = getWaveHeight(position[0], position[2] + offset, time) - waveY;
		const tiltMultiplier = isDinghy ? 0.5 : 0.4;

		this.group.position.set(position[0], waveY + bobY + (isDinghy ? 0.15 : 0.2), position[2]);
		this.group.rotation.set(
			bobPitch + waveTiltZ * tiltMultiplier,
			rotation,
			bobRoll + waveTiltX * tiltMultiplier,
		);

		// Animate cannon sway (ship only)
		if (this.cannonGroup) {
			this.cannonGroup.rotation.y = Math.sin(time * 0.5) * 0.1;
		}

		// Update wake particles
		this.updateWake(position, rotation, velocity);
	}

	private updateWake(position: [number, number, number], rotation: number, velocity: number): void {
		const now = performance.now();
		const isDinghy = this.boatType === 'dinghy';

		// Remove expired bubbles
		this.bubbles = this.bubbles.filter((b) => now - b.birthTime < b.lifetime);

		// Spawn new bubbles when moving
		if (velocity > 0.05) {
			const spawnCount = isDinghy ? 3 : 6;
			for (let s = 0; s < spawnCount; s++) {
				if (Math.random() > 0.6) continue;

				const backOffset = (isDinghy ? 0.4 : 0.6) + Math.random() * 0.4;
				const spread = (Math.random() - 0.5) * (isDinghy ? 0.6 : 1.0);

				const newX = position[0] - Math.sin(rotation) * backOffset + Math.cos(rotation) * spread;
				const newZ = position[2] - Math.cos(rotation) * backOffset - Math.sin(rotation) * spread;

				// Varied sizes - bigger range
				const baseSize = isDinghy ? 0.1 : 0.15;
				const sizeVariation = Math.random() * (isDinghy ? 0.2 : 0.35);

				// Spread velocity (gentle radial from boat direction)
				const spreadSpeed = 0.00005 + Math.random() * 0.0001;
				const spreadAngle = rotation + Math.PI + (Math.random() - 0.5) * 0.8;

				this.bubbles.push({
					startX: newX,
					startZ: newZ,
					vx: Math.sin(spreadAngle) * spreadSpeed,
					vz: Math.cos(spreadAngle) * spreadSpeed,
					size: baseSize + sizeVariation + velocity * 0.05,
					birthTime: now,
					lifetime: 2000 + Math.random() * 1500, // 2-3.5 seconds
				});
			}
		}

		// Update geometry from bubbles array
		const positions = this.wakeGeometry.attributes.position as THREE.BufferAttribute;
		const sizes = this.wakeGeometry.attributes.size as THREE.BufferAttribute;

		// Clear all first
		for (let i = 0; i < BUBBLE_MAX_COUNT; i++) {
			positions.setXYZ(i, 0, -100, 0);
			sizes.setX(i, 0);
		}

		// Write active bubbles (up to buffer limit)
		const count = Math.min(this.bubbles.length, BUBBLE_MAX_COUNT);
		for (let i = 0; i < count; i++) {
			const bubble = this.bubbles[i];
			const age = now - bubble.birthTime;
			const lifeProgress = age / bubble.lifetime;

			// Spread out over time (position = start + velocity * time)
			const currentX = bubble.startX + bubble.vx * age;
			const currentZ = bubble.startZ + bubble.vz * age;

			// Fade out over lifetime
			const fadeStart = 0.5; // Start fading at 50% lifetime
			const alpha = lifeProgress > fadeStart ? 1 - (lifeProgress - fadeStart) / (1 - fadeStart) : 1;

			// Size grows slightly then shrinks as it ages (dissipation effect)
			const growPhase = Math.min(lifeProgress * 3, 1); // Grow for first 33%
			const shrinkPhase = Math.max(0, (lifeProgress - 0.5) * 2); // Shrink after 50%
			const currentSize = bubble.size * (1 + growPhase * 0.3) * (1 - shrinkPhase * 0.5) * alpha;

			positions.setXYZ(i, currentX, BUBBLE_Y, currentZ);
			sizes.setX(i, currentSize);
		}

		this.wakeGeometry.setDrawRange(0, count);
		positions.needsUpdate = true;
		sizes.needsUpdate = true;
	}

	getWakeMesh(): THREE.Points {
		return this.wakeMesh;
	}

	dispose(): void {
		this.wakeGeometry.dispose();
		this.wakeMaterial.map?.dispose();
		this.wakeMaterial.dispose();
		this.bubbles = [];

		if (this.boatModel) {
			this.boatModel.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (child.material) {
						(child.material as THREE.Material).dispose();
					}
				}
			});
		}

		if (this.cannonGroup) {
			this.cannonGroup.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (child.material) {
						(child.material as THREE.Material).dispose();
					}
				}
			});
		}
	}
}
