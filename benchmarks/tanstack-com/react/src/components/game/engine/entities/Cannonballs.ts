import * as THREE from 'three';
import type { Cannonball } from '../../hooks/useGameStore';

const CANNONBALL_RADIUS = 0.15;
const GATLING_RADIUS = 0.08;

interface CannonballMesh {
	id: number;
	mesh: THREE.Mesh;
}

interface SplashEffect {
	id: number;
	group: THREE.Group;
	startTime: number;
	position: THREE.Vector3;
}

export class Cannonballs {
	group: THREE.Group;
	private balls: Map<number, CannonballMesh> = new Map();
	private splashes: SplashEffect[] = [];
	private ballGeometry: THREE.SphereGeometry;
	private gatlingGeometry: THREE.SphereGeometry;
	private ballMaterial: THREE.MeshStandardMaterial;
	private splashGeometry: THREE.SphereGeometry;
	private splashMaterial: THREE.MeshBasicMaterial;

	constructor() {
		this.group = new THREE.Group();

		this.ballGeometry = new THREE.SphereGeometry(CANNONBALL_RADIUS, 12, 12);
		this.gatlingGeometry = new THREE.SphereGeometry(GATLING_RADIUS, 8, 8);
		this.ballMaterial = new THREE.MeshStandardMaterial({
			color: '#333333',
			metalness: 0.8,
			roughness: 0.3,
		});

		this.splashGeometry = new THREE.SphereGeometry(0.3, 8, 8);
		this.splashMaterial = new THREE.MeshBasicMaterial({
			color: '#FFFFFF',
			transparent: true,
			opacity: 0.9,
			depthWrite: false,
			fog: false,
			blending: THREE.AdditiveBlending,
		});
	}

	updateBalls(cannonballs: Cannonball[]): void {
		const currentIds = new Set(cannonballs.map((b) => b.id));

		// Remove balls that no longer exist
		for (const [id, ball] of this.balls) {
			if (!currentIds.has(id)) {
				this.group.remove(ball.mesh);
				this.balls.delete(id);
			}
		}

		// Add/update balls
		for (const cannonball of cannonballs) {
			let ball = this.balls.get(cannonball.id);

			if (!ball) {
				const geometry = cannonball.isGatling ? this.gatlingGeometry : this.ballGeometry;
				const mesh = new THREE.Mesh(geometry, this.ballMaterial);
				mesh.castShadow = true;
				ball = { id: cannonball.id, mesh };
				this.balls.set(cannonball.id, ball);
				this.group.add(mesh);
			}

			ball.mesh.position.set(...cannonball.position);
		}
	}

	addSplash(position: [number, number, number]): void {
		const splashGroup = new THREE.Group();
		splashGroup.position.set(...position);

		const mat = this.splashMaterial.clone();
		mat.color.setHex(0xffffff); // Ensure white
		const splashMesh = new THREE.Mesh(this.splashGeometry, mat);
		splashMesh.renderOrder = 100; // Render on top
		splashGroup.add(splashMesh);

		const splash: SplashEffect = {
			id: Date.now() + Math.random(),
			group: splashGroup,
			startTime: Date.now(),
			position: new THREE.Vector3(...position),
		};

		this.splashes.push(splash);
		this.group.add(splashGroup);
	}

	update(_delta: number): void {
		const now = Date.now();
		const toRemove: SplashEffect[] = [];

		for (const splash of this.splashes) {
			const elapsed = now - splash.startTime;
			const progress = elapsed / 500; // 500ms animation

			if (progress >= 1) {
				toRemove.push(splash);
				continue;
			}

			// Expand and fade
			const scale = 1 + progress * 2;
			splash.group.scale.set(scale, scale, scale);

			splash.group.children.forEach((child) => {
				if (child instanceof THREE.Mesh) {
					const mat = child.material as THREE.MeshBasicMaterial;
					mat.opacity = 0.8 * (1 - progress);
				}
			});
		}

		// Remove completed splashes
		for (const splash of toRemove) {
			this.group.remove(splash.group);
			splash.group.children.forEach((child) => {
				if (child instanceof THREE.Mesh) {
					(child.material as THREE.Material).dispose();
				}
			});
			this.splashes = this.splashes.filter((s) => s.id !== splash.id);
		}
	}

	dispose(): void {
		this.balls.forEach((ball) => {
			this.group.remove(ball.mesh);
		});
		this.balls.clear();

		this.splashes.forEach((splash) => {
			this.group.remove(splash.group);
			splash.group.children.forEach((child) => {
				if (child instanceof THREE.Mesh) {
					(child.material as THREE.Material).dispose();
				}
			});
		});
		this.splashes = [];

		this.ballGeometry.dispose();
		this.gatlingGeometry.dispose();
		this.ballMaterial.dispose();
		this.splashGeometry.dispose();
		this.splashMaterial.dispose();
		this.group.clear();
	}
}
