import * as THREE from 'three';
import type { CoinData } from '../../hooks/useGameStore';

const RENDER_DISTANCE = 50;
const MAX_COINS = 150;

// Animation speeds
const SPIN_SPEED = 0.8;
const BOB_SPEED = 0.6;
const BOB_AMOUNT = 0.08;

// Coin dimensions
const COIN_RADIUS = 0.4;
const COIN_THICKNESS = 0.1;

export class Coins {
	group: THREE.Group;
	private instancedMesh: THREE.InstancedMesh;
	private coins: CoinData[] = [];
	private tempPosition = new THREE.Vector3();
	private tempQuaternion = new THREE.Quaternion();
	private tempScale = new THREE.Vector3(1, 1, 1);
	private tempMatrix = new THREE.Matrix4();
	private visibleIndices: Map<number, number> = new Map();
	private logoTexture: THREE.Texture | null = null;

	// Pre-computed quaternion for standing on edge (rotate 90 degrees on X)
	private standingRotation = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(Math.PI / 2, 0, 0),
	);

	constructor() {
		this.group = new THREE.Group();

		// Create coin geometry
		const geometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 32);

		// Load logo texture and create material
		this.loadLogoTexture().then((materials) => {
			this.instancedMesh.material = materials;
		});

		// Start with simple gold material, will be replaced when texture loads
		const tempMaterial = new THREE.MeshStandardMaterial({
			color: '#FFDF00',
			metalness: 0.9,
			roughness: 0.15,
			emissive: '#FFD700',
			emissiveIntensity: 0.4,
		});

		this.instancedMesh = new THREE.InstancedMesh(geometry, tempMaterial, MAX_COINS);
		this.instancedMesh.count = 0;
		this.instancedMesh.frustumCulled = false;
		this.group.add(this.instancedMesh);
	}

	private async loadLogoTexture(): Promise<THREE.Material[]> {
		return new Promise((resolve) => {
			// Create canvas to render SVG with gold background and black logo
			const canvas = document.createElement('canvas');
			const size = 512;
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d')!;

			// Gold background (circular)
			ctx.fillStyle = '#FFDF00';
			ctx.beginPath();
			ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
			ctx.fill();

			// Load and draw the SVG logo
			const img = new Image();
			img.onload = () => {
				// Draw logo centered, scaled to fit, rotated -90 degrees
				const logoSize = size * 0.85;
				ctx.save();
				ctx.translate(size / 2, size / 2);
				ctx.rotate(-Math.PI / 2);
				// Draw with slight transparency for softer black
				ctx.globalAlpha = 0.25;
				ctx.drawImage(img, -logoSize / 2, -logoSize / 2, logoSize, logoSize);
				ctx.restore();

				// Create texture from canvas
				this.logoTexture = new THREE.CanvasTexture(canvas);
				this.logoTexture.colorSpace = THREE.SRGBColorSpace;
				this.logoTexture.anisotropy = 16;
				this.logoTexture.minFilter = THREE.LinearMipmapLinearFilter;
				this.logoTexture.magFilter = THREE.LinearFilter;

				// Create materials array for cylinder faces
				// CylinderGeometry has 3 groups: side (0), top cap (1), bottom cap (2)
				const edgeMaterial = new THREE.MeshStandardMaterial({
					color: '#FFDF00',
					metalness: 0.9,
					roughness: 0.15,
					emissive: '#FFD700',
					emissiveIntensity: 0.4,
				});

				const faceMaterial = new THREE.MeshStandardMaterial({
					map: this.logoTexture,
					metalness: 0.3,
					roughness: 0.5,
					emissive: '#000000',
					emissiveIntensity: 0,
				});

				resolve([edgeMaterial, faceMaterial, faceMaterial]);
			};

			img.onerror = () => {
				// Fallback to plain gold if SVG fails to load
				const goldMaterial = new THREE.MeshStandardMaterial({
					color: '#FFDF00',
					metalness: 0.9,
					roughness: 0.15,
					emissive: '#FFD700',
					emissiveIntensity: 0.4,
				});
				resolve([goldMaterial, goldMaterial, goldMaterial]);
			};

			img.src = '/images/logos/logo-black.svg';
		});
	}

	setCoins(coins: CoinData[]): void {
		this.coins = coins;
	}

	update(time: number, boatPosition: [number, number, number]): void {
		this.visibleIndices.clear();
		let instanceIndex = 0;

		for (const coin of this.coins) {
			if (coin.collected) continue;

			// Distance culling
			const dx = coin.position[0] - boatPosition[0];
			const dz = coin.position[2] - boatPosition[2];
			const distSq = dx * dx + dz * dz;

			if (distSq > RENDER_DISTANCE * RENDER_DISTANCE) continue;
			if (instanceIndex >= MAX_COINS) break;

			// Each coin has slightly different phase based on id
			const phase = coin.id * 0.7;

			// Slow spin around vertical axis (Y in world space, which is Z in local coin space)
			const spinAngle = time * SPIN_SPEED + phase;

			// Gentle bob up and down
			const bobY = coin.position[1] + Math.sin(time * BOB_SPEED + phase) * BOB_AMOUNT;

			// Build rotation: first stand on edge, then spin
			const spinQuat = new THREE.Quaternion().setFromAxisAngle(
				new THREE.Vector3(0, 0, 1), // Spin around local Z (which is world Y after standing)
				spinAngle,
			);
			this.tempQuaternion.copy(this.standingRotation).multiply(spinQuat);

			// Set position
			this.tempPosition.set(coin.position[0], bobY, coin.position[2]);

			// Compose matrix
			this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
			this.instancedMesh.setMatrixAt(instanceIndex, this.tempMatrix);

			this.visibleIndices.set(coin.id, instanceIndex);
			instanceIndex++;
		}

		this.instancedMesh.count = instanceIndex;
		this.instancedMesh.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.instancedMesh.geometry.dispose();
		const materials = this.instancedMesh.material;
		if (Array.isArray(materials)) {
			materials.forEach((m) => m.dispose());
		} else {
			materials.dispose();
		}
		this.logoTexture?.dispose();
	}
}
