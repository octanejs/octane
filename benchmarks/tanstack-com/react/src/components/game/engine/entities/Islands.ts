import * as THREE from 'three';
import type { IslandData } from '../../utils/islandGenerator';
import { COLORS, getLibraryColor } from '../../utils/colors';
import { modelLoader } from '../loaders/ModelLoader';
import { useGameStore } from '../../hooks/useGameStore';
// @ts-expect-error - troika-three-text has no types
import { Text } from 'troika-three-text';

const CULL_DISTANCE = 80;
const _INFO_SHOW_DISTANCE = 10;

function seededRandom(seed: number) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

interface WaveRing {
	mesh: THREE.Mesh;
	baseRadius: number;
	offset: number;
}

interface IslandInstance {
	data: IslandData;
	group: THREE.Group;
	infoGroup: THREE.Group | null;
	flagGroup: THREE.Group | null;
	beacon: THREE.PointLight | null;
	confetti: ConfettiParticle[];
	waveRings: WaveRing[];
	flagPosition: number;
	scaleVelocity: number;
	currentScale: number;
	infoScale: number;
	infoScaleVelocity: number;
	wasDiscovered: boolean;
	confettiSpawned: boolean;
	debugCircles: THREE.Line[];
}

interface ConfettiParticle {
	mesh: THREE.Mesh;
	velocity: THREE.Vector3;
	rotationSpeed: THREE.Vector3;
	lifetime: number;
}

const FRAMEWORK_COLORS: Record<string, string> = {
	react: '#61DAFB',
	vue: '#4FC08D',
	solid: '#2C4F7C',
	svelte: '#FF3E00',
	angular: '#DD0031',
	lit: '#325CCC',
	qwik: '#18B6F6',
	preact: '#673AB8',
	vanilla: '#F7DF1E',
};

export class Islands {
	group: THREE.Group;
	private instances: Map<string, IslandInstance> = new Map();

	constructor() {
		this.group = new THREE.Group();
	}

	setIslands(
		coreIslands: IslandData[],
		expandedIslands: IslandData[],
		showcaseIslands: IslandData[] = [],
		cornerIslands: IslandData[] = [],
	): void {
		const allIslands = [...coreIslands, ...expandedIslands, ...showcaseIslands, ...cornerIslands];

		// Remove islands that no longer exist
		for (const [id, instance] of this.instances) {
			if (!allIslands.find((i) => i.id === id)) {
				this.group.remove(instance.group);
				this.disposeInstance(instance);
				this.instances.delete(id);
			}
		}

		// Add new islands
		for (const island of allIslands) {
			if (!this.instances.has(island.id)) {
				const instance = this.createIslandInstance(island);
				this.instances.set(island.id, instance);
				this.group.add(instance.group);
			}
		}
	}

	// Get all visible info groups for raycasting
	getClickableInfoGroups(): THREE.Group[] {
		const groups: THREE.Group[] = [];
		for (const instance of this.instances.values()) {
			if (instance.infoGroup && instance.infoGroup.visible && instance.infoScale > 0.1) {
				groups.push(instance.infoGroup);
			}
		}
		return groups;
	}

	// Get island data by info group
	getIslandByInfoGroup(infoGroup: THREE.Group): IslandData | null {
		const islandId = infoGroup.userData.islandId;
		if (!islandId) return null;
		const instance = this.instances.get(islandId);
		return instance?.data ?? null;
	}

	// Set hover state on info group
	setInfoHover(infoGroup: THREE.Group | null): void {
		// Reset all hover states first
		for (const instance of this.instances.values()) {
			if (instance.infoGroup) {
				const bgMat = instance.infoGroup.userData.bgMaterial as THREE.MeshStandardMaterial | null;
				const borderMat = instance.infoGroup.userData
					.borderMaterial as THREE.MeshStandardMaterial | null;
				if (bgMat) {
					bgMat.emissiveIntensity = 0;
				}
				if (borderMat) {
					borderMat.opacity = 0.3;
				}
			}
		}

		// Set hover on target
		if (infoGroup) {
			const bgMat = infoGroup.userData.bgMaterial as THREE.MeshStandardMaterial | null;
			const borderMat = infoGroup.userData.borderMaterial as THREE.MeshStandardMaterial | null;
			if (bgMat) {
				bgMat.emissiveIntensity = 0.2;
			}
			if (borderMat) {
				borderMat.opacity = 0.5;
			}
		}
	}

	private createIslandInstance(data: IslandData): IslandInstance {
		const group = new THREE.Group();
		group.position.set(...data.position);
		group.rotation.y = data.rotation;
		group.scale.setScalar(data.scale);

		const { library, partner, showcase } = data;
		const libraryColor =
			data.type === 'library' && library
				? getLibraryColor(library.id)
				: data.type === 'partner' && partner?.brandColor
					? partner.brandColor
					: data.type === 'partner'
						? '#f59e0b'
						: data.type === 'showcase'
							? '#8b5cf6' // Purple for showcase islands
							: '#8b5cf6';

		const seedId = library?.id ?? partner?.id ?? showcase?.id ?? data.id;
		const seed = seedId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

		// Create island geometry
		const sphereRadius = 8;
		const islandRadius = 2.2 * data.elongation;
		const surfaceHeight = Math.sqrt(sphereRadius * sphereRadius - islandRadius * islandRadius);
		const sphereCenterY = -surfaceHeight + 0.3;

		// Island mesh with vertex colors
		const islandGeo = this.createIslandGeometry(
			sphereRadius,
			data.elongation,
			seed,
			sphereCenterY,
			data.scale,
		);
		const islandMesh = new THREE.Mesh(
			islandGeo,
			new THREE.MeshStandardMaterial({
				vertexColors: true,
				roughness: 0.85,
				transparent: true,
			}),
		);
		islandMesh.position.y = sphereCenterY;
		islandMesh.castShadow = true;
		islandMesh.receiveShadow = true;
		group.add(islandMesh);

		// Wave rings will be added in world space after instance creation
		const waveRings: WaveRing[] = [];

		// Palm tints (used for main island and lobes)
		const palmTints = ['#AAFFAA', '#CCFFCC', '#88FF88', '#BBFFBB', '#99FF99'];

		// Lobes (additional spherical caps for organic shape)
		for (let i = 0; i < data.lobes.length; i++) {
			const lobe = data.lobes[i];
			const lobeGroup = new THREE.Group();
			lobeGroup.position.set(lobe.offsetX, 0, lobe.offsetZ);
			lobeGroup.scale.setScalar(lobe.scale);

			const lobeSphereRadius = 8;
			const lobeElongation = data.elongation * 0.9;
			const lobeIslandRadius = 2.2 * lobeElongation;
			const lobeSurfaceHeight = Math.sqrt(
				lobeSphereRadius * lobeSphereRadius - lobeIslandRadius * lobeIslandRadius,
			);
			const lobeSphereY = -lobeSurfaceHeight + 0.3;

			// Lobe island mesh
			const lobeGeo = this.createIslandGeometry(
				lobeSphereRadius,
				lobeElongation,
				seed + 1000 + i * 100,
				lobeSphereY,
				data.scale * lobe.scale,
			);
			const lobeMesh = new THREE.Mesh(
				lobeGeo,
				new THREE.MeshStandardMaterial({
					vertexColors: true,
					roughness: 0.85,
					transparent: true,
				}),
			);
			lobeMesh.position.y = lobeSphereY;
			lobeMesh.castShadow = true;
			lobeMesh.receiveShadow = true;
			lobeGroup.add(lobeMesh);

			// Wave rings for lobe (use pre-calculated world positions from lobe data)
			const lobeWorldRadius = lobeIslandRadius * data.scale * lobe.scale;
			const lobeWorldX = lobe.worldX;
			const lobeWorldZ = lobe.worldZ;
			for (let w = 0; w < 2; w++) {
				const innerRadius = lobeWorldRadius + 2.0 + w * 0.8;
				const outerRadius = innerRadius + 0.5;
				const waveRingGeo = new THREE.RingGeometry(innerRadius, outerRadius, 48);
				const opacity = 0.12 - w * 0.03;
				const waveRingMat = new THREE.MeshStandardMaterial({
					color: w === 0 ? '#FFFFFF' : '#40E0D0',
					transparent: true,
					opacity,
					depthWrite: false,
				});
				const waveRingMesh = new THREE.Mesh(waveRingGeo, waveRingMat);
				waveRingMesh.rotation.x = -Math.PI / 2;
				waveRingMesh.position.set(lobeWorldX, -0.7, lobeWorldZ);
				waveRingMesh.renderOrder = -1;
				this.group.add(waveRingMesh);
				waveRings.push({
					mesh: waveRingMesh,
					baseRadius: (innerRadius + outerRadius) / 2,
					offset: w * 0.7 + i * 0.3,
				});
			}

			// Add palm trees to lobe (1-2 based on lobe size)
			const lobeSeed = seed + 1000 + i * 100;
			const lobePalmCount = Math.floor(1 + lobe.scale * 2);
			for (let p = 0; p < lobePalmCount; p++) {
				const palmAngle = seededRandom(lobeSeed + p * 50) * Math.PI * 2;
				const palmRadius = 0.3 + seededRandom(lobeSeed + p * 51) * 0.8;
				const palmX = Math.cos(palmAngle) * palmRadius;
				const palmZ = Math.sin(palmAngle) * palmRadius;
				const palmY = this.getHeightOnSphere(palmX, palmZ, lobeSphereRadius, lobeSphereY);

				const tint = new THREE.Color(palmTints[p % palmTints.length]);
				const palm = modelLoader.clone('/models/palm-tree.glb', tint);
				palm.scale.setScalar(0.5 * (0.4 + seededRandom(lobeSeed + p * 52) * 0.3));
				palm.position.set(palmX, palmY, palmZ);
				palm.rotation.y = seededRandom(lobeSeed + p * 53) * Math.PI * 2;
				lobeGroup.add(palm);
			}

			// Add some shrubs/rocks to lobe
			const lobeDecoCount = Math.floor(2 + lobe.scale * 3);
			for (let d = 0; d < lobeDecoCount; d++) {
				const decoAngle = seededRandom(lobeSeed + 200 + d * 30) * Math.PI * 2;
				const decoRadius = 0.4 + seededRandom(lobeSeed + 201 + d * 30) * 0.6;
				const decoX = Math.cos(decoAngle) * decoRadius;
				const decoZ = Math.sin(decoAngle) * decoRadius;
				const decoY = this.getHeightOnSphere(decoX, decoZ, lobeSphereRadius, lobeSphereY);

				// Alternate between rocks and shrubs
				if (d % 2 === 0) {
					// Rock
					const rock = new THREE.Mesh(
						new THREE.DodecahedronGeometry(0.15, 0),
						new THREE.MeshStandardMaterial({
							color: '#8B8B83',
							roughness: 0.9,
						}),
					);
					rock.position.set(decoX, decoY, decoZ);
					rock.rotation.set(0.1, seededRandom(lobeSeed + 202 + d * 30) * Math.PI, 0.1);
					rock.scale.setScalar(0.5 + seededRandom(lobeSeed + 203 + d * 30) * 0.5);
					rock.castShadow = true;
					lobeGroup.add(rock);
				} else {
					// Shrub
					const shrubColors = ['#2D5A27', '#3D7A37', '#1E4620', '#4A8B44'];
					const shrub = new THREE.Mesh(
						new THREE.IcosahedronGeometry(0.12, 1),
						new THREE.MeshStandardMaterial({
							color: shrubColors[d % shrubColors.length],
							roughness: 0.8,
						}),
					);
					shrub.position.set(decoX, decoY + 0.05, decoZ);
					shrub.scale.setScalar(0.6 + seededRandom(lobeSeed + 204 + d * 30) * 0.4);
					shrub.castShadow = true;
					lobeGroup.add(shrub);
				}
			}

			group.add(lobeGroup);
		}

		// Palm trees on main island
		for (let i = 0; i < data.palmCount; i++) {
			const angle = seededRandom(seed + i * 100) * Math.PI * 2;
			const radius = 0.5 + seededRandom(seed + i * 101) * 1.2;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;
			const y = this.getHeightOnSphere(x, z, sphereRadius, sphereCenterY);

			const tint = new THREE.Color(palmTints[i % palmTints.length]);
			const palm = modelLoader.clone('/models/palm-tree.glb', tint);
			palm.scale.setScalar(0.7 * (0.5 + seededRandom(seed + i * 102) * 0.3));
			palm.position.set(x, y, z);
			palm.rotation.y = seededRandom(seed + i * 103) * Math.PI * 2;
			group.add(palm);
		}

		// Beach chair
		const chairAngle = seededRandom(seed + 200) * Math.PI * 2;
		const chairRadius = 2.0 + seededRandom(seed + 201) * 0.5;
		const chairX = Math.cos(chairAngle) * chairRadius;
		const chairZ = Math.sin(chairAngle) * chairRadius;
		const chairY = this.getHeightOnSphere(chairX, chairZ, sphereRadius, sphereCenterY);
		const chair = this.createBeachChair();
		chair.position.set(chairX, chairY, chairZ);
		chair.rotation.y = chairAngle + Math.PI * 0.8;
		chair.scale.setScalar(0.65);
		group.add(chair);

		// Tiki shack (conditional)
		if (data.hasTikiShack) {
			const shackX = (seededRandom(seed + 400) - 0.5) * 0.8;
			const shackZ = (seededRandom(seed + 401) - 0.5) * 0.8;
			const shackY = this.getHeightOnSphere(shackX, shackZ, sphereRadius, sphereCenterY);
			const shack = this.createTikiShack(libraryColor);
			shack.position.set(shackX, shackY, shackZ);
			shack.rotation.y = seededRandom(seed + 402) * Math.PI * 2;
			group.add(shack);
		}

		// Rocks, shrubs, grass (simplified for performance)
		this.addDecorations(group, seed, sphereRadius, sphereCenterY, data.hasTikiShack, {
			x: chairX,
			z: chairZ,
		});

		// Beacon light
		const beacon = new THREE.PointLight(libraryColor, 2.5, 12);
		beacon.position.set(0, 3.5, 0);
		group.add(beacon);

		// Flag (positioned in world space, outside island rotation)
		const flagGroup = this.createFlag(data, libraryColor);
		const flagWorldPos = this.calculateFlagWorldPosition(data, sphereRadius, sphereCenterY);
		flagGroup.position.set(...flagWorldPos);
		// Flag is added to main group but won't rotate with island
		this.group.add(flagGroup);

		// Info card (created but hidden initially)
		const infoGroup = this.createInfoCard(data, libraryColor);
		infoGroup.visible = false;
		infoGroup.scale.setScalar(0.001);
		this.group.add(infoGroup);

		// Wave rings around island (in world space, underwater)
		const worldRadius = islandRadius * data.scale;
		const waveRingCount = 2;
		for (let w = 0; w < waveRingCount; w++) {
			const innerRadius = worldRadius + 2.2 + w * 0.6;
			const outerRadius = innerRadius + 0.2;
			const waveRingGeo = new THREE.RingGeometry(innerRadius, outerRadius, 64);
			const opacity = 0.2 - w * 0.05;
			const waveRingMat = new THREE.MeshStandardMaterial({
				color: w === 0 ? '#FFFFFF' : '#40E0D0',
				transparent: true,
				opacity,
				depthWrite: false, // Don't write to depth buffer so water renders on top
			});
			const waveRingMesh = new THREE.Mesh(waveRingGeo, waveRingMat);
			waveRingMesh.rotation.x = -Math.PI / 2;
			waveRingMesh.position.set(data.position[0], -0.7, data.position[2]);
			waveRingMesh.renderOrder = -1; // Render before water surface
			this.group.add(waveRingMesh);
			waveRings.push({
				mesh: waveRingMesh,
				baseRadius: (innerRadius + outerRadius) / 2,
				offset: w * 0.7,
			});
		}

		return {
			data,
			group,
			infoGroup,
			flagGroup,
			beacon,
			confetti: [],
			waveRings,
			flagPosition: 0,
			scaleVelocity: 0,
			currentScale: 0,
			infoScale: 0,
			infoScaleVelocity: 0,
			wasDiscovered: false,
			confettiSpawned: false,
			debugCircles: [],
		};
	}

	private createIslandGeometry(
		sphereRadius: number,
		elongation: number,
		seed: number,
		sphereCenterY: number,
		scale: number = 1,
	): THREE.BufferGeometry {
		const geo = new THREE.SphereGeometry(sphereRadius, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.25);
		const posAttr = geo.attributes.position;
		const colors: number[] = [];

		const shallowColor = new THREE.Color('#40E0D0');
		const foamColor = new THREE.Color('#E8F4F8');
		const sandColorLight = new THREE.Color(COLORS.sand.light);
		const sandColorMid = new THREE.Color(COLORS.sand.mid);
		const grassColorDark = new THREE.Color('#1B5E20');
		const grassColorLight = new THREE.Color('#2E7D32');

		// Absolute Y thresholds (in world units, not affected by scale)
		const transparentY = -1.2 / scale; // Fully transparent below this
		const shallowY = -0.4 / scale; // Start fading to transparent
		const foamY = -0.35 / scale;
		const sandY = -0.2 / scale;
		const grassY = -0.05 / scale; // Lower threshold = more grass coverage

		for (let i = 0; i < posAttr.count; i++) {
			const x = posAttr.getX(i);
			const y = posAttr.getY(i);
			const z = posAttr.getZ(i);

			const angle = Math.atan2(z, x);
			const absoluteY = y + sphereCenterY;
			const colorNoise = Math.sin(angle * 7 + seed) * 0.5 + 0.5;

			let color: THREE.Color;
			let alpha = 1.0;

			if (absoluteY < transparentY) {
				// Deep underwater - fully transparent (shows sea floor)
				color = shallowColor.clone();
				alpha = 0.0;
			} else if (absoluteY < shallowY) {
				// Fade from transparent to shallow
				const progress = THREE.MathUtils.smoothstep(absoluteY, transparentY, shallowY);
				color = shallowColor.clone();
				color.lerp(new THREE.Color('#00AAEE'), colorNoise * 0.2);
				alpha = progress;
			} else if (absoluteY < foamY) {
				const progress = THREE.MathUtils.smoothstep(absoluteY, shallowY, foamY);
				color = shallowColor.clone().lerp(foamColor, progress);
				color.lerp(new THREE.Color('#FFFFFF'), colorNoise * 0.2);
			} else if (absoluteY < sandY) {
				const sandProgress = THREE.MathUtils.smoothstep(absoluteY, foamY, sandY);
				const wetSand = sandColorLight.clone().lerp(foamColor, 0.15);
				color = foamColor.clone().lerp(wetSand, sandProgress * 0.5);
				color.lerp(sandColorMid, sandProgress);
				color.lerp(sandColorMid.clone().multiplyScalar(0.95), colorNoise * 0.15);
			} else {
				const grassProgress = THREE.MathUtils.smoothstep(absoluteY, sandY, grassY);
				const grassNoise = Math.sin(x * 3.7 + seed) * Math.cos(z * 4.1 + seed * 1.3) * 0.5 + 0.5;
				const baseGrass = grassColorDark.clone().lerp(grassColorLight, 0.3);
				const grassColor = baseGrass.clone().lerp(grassColorDark, grassNoise * 0.25);
				color = sandColorMid.clone().lerp(grassColor, grassProgress);
			}

			colors.push(color.r, color.g, color.b, alpha);
		}

		geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
		geo.computeVertexNormals();
		return geo;
	}

	private getHeightOnSphere(
		x: number,
		z: number,
		sphereRadius: number,
		sphereCenterY: number,
	): number {
		const distFromCenter = Math.sqrt(x * x + z * z);
		if (distFromCenter >= sphereRadius) return 0;
		return Math.sqrt(sphereRadius * sphereRadius - distFromCenter * distFromCenter) + sphereCenterY;
	}

	private createBeachChair(): THREE.Group {
		const chair = new THREE.Group();
		const legMat = new THREE.MeshStandardMaterial({ color: '#D97706' });
		const seatMat = new THREE.MeshStandardMaterial({ color: '#E41931' });
		const stripeMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF' });

		// Back legs (taller)
		const backLegGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8);
		const backLegPositions = [
			[-0.25, 0.25, -0.35],
			[0.25, 0.25, -0.35],
		];
		backLegPositions.forEach((pos) => {
			const leg = new THREE.Mesh(backLegGeo, legMat);
			leg.position.set(pos[0], pos[1], pos[2]);
			leg.castShadow = true;
			chair.add(leg);
		});

		// Front legs (shorter)
		const frontLegGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8);
		const frontLegPositions = [
			[-0.25, 0.15, 0.35],
			[0.25, 0.15, 0.35],
		];
		frontLegPositions.forEach((pos) => {
			const leg = new THREE.Mesh(frontLegGeo, legMat);
			leg.position.set(pos[0], pos[1], pos[2]);
			leg.castShadow = true;
			chair.add(leg);
		});

		// Seat
		const seatGeo = new THREE.BoxGeometry(0.6, 0.05, 0.8);
		const seat = new THREE.Mesh(seatGeo, seatMat);
		seat.position.set(0, 0.35, 0);
		seat.rotation.x = -0.2;
		seat.castShadow = true;
		chair.add(seat);

		// Seat stripes (2 thick white stripes)
		for (let i = -1; i <= 1; i += 2) {
			const stripeGeo = new THREE.BoxGeometry(0.12, 0.06, 0.8);
			const stripe = new THREE.Mesh(stripeGeo, stripeMat);
			stripe.position.set(i * 0.18, 0.35, 0);
			stripe.rotation.x = -0.2;
			chair.add(stripe);
		}

		// Back
		const backGeo = new THREE.BoxGeometry(0.6, 0.6, 0.05);
		const back = new THREE.Mesh(backGeo, seatMat);
		back.position.set(0, 0.65, -0.3);
		back.rotation.x = -0.5;
		back.castShadow = true;
		chair.add(back);

		// Back stripes (2 thick white stripes)
		for (let i = -1; i <= 1; i += 2) {
			const stripeGeo = new THREE.BoxGeometry(0.12, 0.6, 0.06);
			const stripe = new THREE.Mesh(stripeGeo, stripeMat);
			stripe.position.set(i * 0.18, 0.65, -0.3);
			stripe.rotation.x = -0.5;
			chair.add(stripe);
		}

		return chair;
	}

	private createTikiShack(color: string): THREE.Group {
		const shack = new THREE.Group();
		const postMat = new THREE.MeshStandardMaterial({ color: '#654321' });
		const roofMat = new THREE.MeshStandardMaterial({ color: '#8B4513' });
		const ornamentMat = new THREE.MeshStandardMaterial({ color });

		// Posts
		const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
		const postPositions = [
			[-0.3, 0.5, -0.3],
			[0.3, 0.5, -0.3],
			[-0.3, 0.5, 0.3],
			[0.3, 0.5, 0.3],
		];
		postPositions.forEach((pos) => {
			const post = new THREE.Mesh(postGeo, postMat);
			post.position.set(pos[0], pos[1], pos[2]);
			post.castShadow = true;
			shack.add(post);
		});

		// Roof
		const roofGeo = new THREE.ConeGeometry(0.6, 0.5, 6);
		const roof = new THREE.Mesh(roofGeo, roofMat);
		roof.position.y = 1.25;
		roof.castShadow = true;
		shack.add(roof);

		// Ornament
		const ornamentGeo = new THREE.SphereGeometry(0.08, 12, 12);
		const ornament = new THREE.Mesh(ornamentGeo, ornamentMat);
		ornament.position.y = 1.55;
		ornament.castShadow = true;
		shack.add(ornament);

		return shack;
	}

	private addDecorations(
		group: THREE.Group,
		seed: number,
		sphereRadius: number,
		sphereCenterY: number,
		hasTikiShack: boolean = false,
		chairPos: { x: number; z: number } = { x: 0, z: 0 },
	): void {
		// Exclusion zone for tiki shack (center area)
		const tikiExclusionRadius = hasTikiShack ? 0.9 : 0;
		// Exclusion zone for beach chair
		const chairExclusionRadius = 0.5;

		// Helper to check if position is in exclusion zone
		const isInExclusionZone = (x: number, z: number): boolean => {
			// Check tiki shack exclusion
			if (hasTikiShack && Math.sqrt(x * x + z * z) < tikiExclusionRadius) {
				return true;
			}
			// Check beach chair exclusion
			const dx = x - chairPos.x;
			const dz = z - chairPos.z;
			if (Math.sqrt(dx * dx + dz * dz) < chairExclusionRadius) {
				return true;
			}
			return false;
		};

		// Rocks - 6-12 rocks (3x original), 2x scale
		const rockGeo = new THREE.DodecahedronGeometry(1, 0);
		const rockColors = ['#7A8B8B', '#8B9A9A', '#6B7B7B', '#9AA8A8', '#5C6B6B'];
		const rockCount = 6 + Math.floor(seededRandom(seed + 500) * 6);

		for (let i = 0; i < rockCount; i++) {
			const angle = seededRandom(seed + 600 + i * 10) * Math.PI * 2;
			const radius = 1.6 + seededRandom(seed + 601 + i * 10) * 0.8;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;

			// Skip if in tiki shack exclusion zone
			if (isInExclusionZone(x, z)) continue;

			const y = this.getHeightOnSphere(x, z, sphereRadius, sphereCenterY) - 0.05;
			// 2x scale: 0.2-0.5 instead of 0.1-0.25
			const scale = 0.2 + seededRandom(seed + 602 + i * 10) * 0.3;

			const rock = new THREE.Mesh(
				rockGeo,
				new THREE.MeshStandardMaterial({
					color: rockColors[i % rockColors.length],
					roughness: 0.9,
				}),
			);
			rock.position.set(x, y, z);
			rock.scale.setScalar(scale);
			rock.rotation.set(
				seededRandom(seed + 603 + i * 10) * 0.4,
				seededRandom(seed + 604 + i * 10) * Math.PI * 2,
				0.1,
			);
			rock.castShadow = true;
			group.add(rock);
		}

		// Shrubs - 12-24 shrubs (3x original), 2x scale, multi-mesh for fullness
		const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
		const shrubColors = ['#2D5A27', '#3D7A37', '#1E4620', '#4A8B44', '#2A6A24'];
		const shrubCount = 12 + Math.floor(seededRandom(seed + 700) * 12);

		for (let i = 0; i < shrubCount; i++) {
			const angle = seededRandom(seed + 800 + i * 10) * Math.PI * 2;
			const radius = 0.2 + seededRandom(seed + 801 + i * 10) * 1.4;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;

			// Skip if in tiki shack exclusion zone
			if (isInExclusionZone(x, z)) continue;

			const y = this.getHeightOnSphere(x, z, sphereRadius, sphereCenterY);
			// 2x scale: 0.16-0.4 instead of 0.08-0.2
			const baseScale = 0.16 + seededRandom(seed + 802 + i * 10) * 0.24;
			const color = shrubColors[i % shrubColors.length];

			// Main shrub
			const shrub = new THREE.Mesh(
				shrubGeo,
				new THREE.MeshStandardMaterial({
					color,
					roughness: 0.8,
				}),
			);
			shrub.position.set(x, y, z);
			shrub.scale.setScalar(baseScale);
			shrub.castShadow = true;
			group.add(shrub);

			// Secondary smaller shrubs for fullness (2 per main shrub)
			for (let j = 0; j < 2; j++) {
				const offsetAngle = seededRandom(seed + 850 + i * 10 + j) * Math.PI * 2;
				const offsetDist =
					baseScale * 0.5 + seededRandom(seed + 851 + i * 10 + j) * baseScale * 0.3;
				const sx = x + Math.cos(offsetAngle) * offsetDist;
				const sz = z + Math.sin(offsetAngle) * offsetDist;

				// Skip secondary shrub if in exclusion zone
				if (isInExclusionZone(sx, sz)) continue;

				const sy = this.getHeightOnSphere(sx, sz, sphereRadius, sphereCenterY);
				const smallScale = baseScale * (0.5 + seededRandom(seed + 852 + i * 10 + j) * 0.3);

				const smallShrub = new THREE.Mesh(
					shrubGeo,
					new THREE.MeshStandardMaterial({
						color: shrubColors[(i + j + 1) % shrubColors.length],
						roughness: 0.8,
					}),
				);
				smallShrub.position.set(sx, sy, sz);
				smallShrub.scale.setScalar(smallScale);
				smallShrub.castShadow = true;
				group.add(smallShrub);
			}
		}

		// Grass tufts - 18-33 tufts (3x original 6-11)
		const grassColors = ['#4A7C3F', '#5A8C4F', '#3A6C2F', '#6A9C5F'];
		const grassCount = 18 + Math.floor(seededRandom(seed + 900) * 15);

		for (let i = 0; i < grassCount; i++) {
			const angle = seededRandom(seed + 1000 + i * 10) * Math.PI * 2;
			const radius = 0.2 + seededRandom(seed + 1001 + i * 10) * 1.6;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;

			// Skip if in tiki shack exclusion zone
			if (isInExclusionZone(x, z)) continue;

			const y = this.getHeightOnSphere(x, z, sphereRadius, sphereCenterY);

			// Create grass tuft (3-5 blades)
			const grassGroup = new THREE.Group();
			grassGroup.position.set(x, y, z);

			const bladeCount = 3 + Math.floor(seededRandom(seed + 1002 + i * 10) * 3);
			const grassColor = grassColors[i % grassColors.length];

			for (let b = 0; b < bladeCount; b++) {
				const bladeGeo = new THREE.ConeGeometry(
					0.015,
					0.12 + seededRandom(seed + 1010 + i * 10 + b) * 0.08,
					4,
				);
				const blade = new THREE.Mesh(
					bladeGeo,
					new THREE.MeshStandardMaterial({ color: grassColor, roughness: 0.9 }),
				);
				const bAngle =
					(b / bladeCount) * Math.PI * 2 + seededRandom(seed + 1020 + i * 10 + b) * 0.5;
				const bDist = 0.02 + seededRandom(seed + 1021 + i * 10 + b) * 0.03;
				blade.position.set(Math.cos(bAngle) * bDist, 0.06, Math.sin(bAngle) * bDist);
				blade.rotation.set(
					(seededRandom(seed + 1030 + i * 10 + b) - 0.5) * 0.3,
					seededRandom(seed + 1031 + i * 10 + b) * Math.PI * 2,
					(seededRandom(seed + 1032 + i * 10 + b) - 0.5) * 0.3,
				);
				grassGroup.add(blade);
			}

			// Add flower to ~40% of grass tufts
			if (seededRandom(seed + 1100 + i) < 0.4) {
				const flowerColors = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#FF9FF3', '#FFFFFF'];
				const flowerColor =
					flowerColors[Math.floor(seededRandom(seed + 1101 + i) * flowerColors.length)];

				// Flower stem
				const stemGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6);
				const stemMat = new THREE.MeshStandardMaterial({ color: '#4A7C3F' });
				const stem = new THREE.Mesh(stemGeo, stemMat);
				stem.position.y = 0.1;
				grassGroup.add(stem);

				// Flower head
				const flowerGeo = new THREE.SphereGeometry(0.025, 8, 8);
				const flowerMat = new THREE.MeshStandardMaterial({ color: flowerColor });
				const flower = new THREE.Mesh(flowerGeo, flowerMat);
				flower.position.y = 0.18;
				grassGroup.add(flower);
			}

			group.add(grassGroup);
		}
	}

	private createFlag(data: IslandData, color: string): THREE.Group {
		const flag = new THREE.Group();

		// Pole
		const poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 2.5, 8);
		const poleMat = new THREE.MeshStandardMaterial({
			color: '#FFFFFF',
			roughness: 0.3,
		});
		const pole = new THREE.Mesh(poleGeo, poleMat);
		pole.position.y = 1.25;
		pole.castShadow = true;
		flag.add(pole);

		// Ball on top
		const ballGeo = new THREE.SphereGeometry(0.06, 12, 12);
		const ball = new THREE.Mesh(ballGeo, poleMat);
		ball.position.y = 2.55;
		ball.castShadow = true;
		flag.add(ball);

		// Flag triangle
		const shape = new THREE.Shape();
		shape.moveTo(0, 0.25);
		shape.lineTo(0.7, 0);
		shape.lineTo(0, -0.25);
		shape.closePath();

		const flagGeo = new THREE.ShapeGeometry(shape);
		const flagMat = new THREE.MeshStandardMaterial({
			color,
			side: THREE.DoubleSide,
			roughness: 0.6,
		});
		const flagMesh = new THREE.Mesh(flagGeo, flagMat);
		flagMesh.position.set(0.03, 0.4, 0.01); // Start at bottom
		flagMesh.castShadow = true;
		flag.add(flagMesh);

		// Store flag mesh reference for animation
		flag.userData.flagMesh = flagMesh;
		flag.userData.islandId = data.id;
		flag.userData.libraryId = data.library?.id;
		flag.userData.partnerId = data.partner?.id;
		flag.userData.partnerHref = data.partner?.href;

		return flag;
	}

	private calculateFlagWorldPosition(
		data: IslandData,
		sphereRadius: number,
		sphereCenterY: number,
	): [number, number, number] {
		const signRadius = 1.8;
		const signOffsetX = signRadius * 0.707;
		const signOffsetZ = signRadius * 0.707;

		const cosR = Math.cos(data.rotation);
		const sinR = Math.sin(data.rotation);
		const localX = signOffsetX * cosR + signOffsetZ * sinR;
		const localZ = -signOffsetX * sinR + signOffsetZ * cosR;
		const localY = this.getHeightOnSphere(localX, localZ, sphereRadius, sphereCenterY);

		return [
			data.position[0] + signOffsetX * data.scale + 0.5,
			data.position[1] + localY * data.scale + 0.1 - 0.25,
			data.position[2] + signOffsetZ * data.scale + 0.5,
		];
	}

	private createInfoCard(data: IslandData, color: string): THREE.Group {
		const info = new THREE.Group();
		const { library, partner, showcase } = data;
		const name = library?.name ?? partner?.name ?? showcase?.name ?? 'Unknown';
		const tagline = library?.tagline ?? partner?.tagline ?? showcase?.tagline ?? '';
		const isPartner = data.type === 'partner' && !!partner;
		const isShowcase = data.type === 'showcase' && !!showcase;

		// Background box
		const bgGeo = new THREE.BoxGeometry(5, 2.2, 0.15);
		const bgMat = new THREE.MeshStandardMaterial({
			color,
			transparent: true,
			opacity: 0.95,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0,
		});
		const bg = new THREE.Mesh(bgGeo, bgMat);
		info.add(bg);

		// Border
		const borderGeo = new THREE.BoxGeometry(5.2, 2.4, 0.15);
		const borderMat = new THREE.MeshStandardMaterial({
			color: '#FFFFFF',
			transparent: true,
			opacity: 0.3,
		});
		const border = new THREE.Mesh(borderGeo, borderMat);
		border.position.z = -0.1;

		// Store materials for hover effects
		info.userData.bgMaterial = bgMat;
		info.userData.borderMaterial = borderMat;
		info.userData.baseColor = color;
		info.add(border);

		// For partners: show "TanStack Partner" label, logo, and tagline
		// For libraries: show name and tagline
		if (isPartner && partner?.logoLight) {
			// "TanStack Partner" label at top
			const partnerLabel = new Text();
			partnerLabel.text = 'TanStack Partner';
			partnerLabel.fontSize = 0.16;
			partnerLabel.color = 0xffffff;
			partnerLabel.anchorX = 'center';
			partnerLabel.anchorY = 'middle';
			partnerLabel.position.set(0, 0.75, 0.12);
			info.add(partnerLabel);
			partnerLabel.sync();

			// Partner logo centered
			const textureLoader = new THREE.TextureLoader();
			textureLoader.load(partner.logoLight, (texture) => {
				const aspect = texture.image.width / texture.image.height;
				// Clamp aspect ratio to reasonable bounds
				const clampedAspect = Math.max(0.5, Math.min(4, aspect));
				const logoHeight = 0.7;
				const logoWidth = Math.min(logoHeight * clampedAspect, 3.5);

				const logoGeo = new THREE.PlaneGeometry(logoWidth, logoHeight);
				const logoMat = new THREE.MeshBasicMaterial({
					map: texture,
					transparent: true,
					side: THREE.DoubleSide,
				});
				const logo = new THREE.Mesh(logoGeo, logoMat);
				logo.position.set(0, 0.15, 0.13);
				info.add(logo);
			});

			// Partner tagline at bottom
			const partnerTagline = new Text();
			partnerTagline.text = partner.tagline || '';
			partnerTagline.fontSize = 0.2;
			partnerTagline.color = 0xffffff;
			partnerTagline.anchorX = 'center';
			partnerTagline.anchorY = 'middle';
			partnerTagline.position.set(0, -0.5, 0.12);
			info.add(partnerTagline);
			partnerTagline.sync();
		} else if (isPartner) {
			// Partner without logo: show label, name, and tagline
			const partnerLabel = new Text();
			partnerLabel.text = 'TanStack Partner';
			partnerLabel.fontSize = 0.16;
			partnerLabel.color = 0xffffff;
			partnerLabel.anchorX = 'center';
			partnerLabel.anchorY = 'middle';
			partnerLabel.position.set(0, 0.7, 0.12);
			info.add(partnerLabel);
			partnerLabel.sync();

			const nameText = new Text();
			nameText.text = name;
			nameText.fontSize = 0.4;
			nameText.color = 0xffffff;
			nameText.anchorX = 'center';
			nameText.anchorY = 'middle';
			nameText.fontWeight = 'bold';
			nameText.position.set(0, 0.2, 0.12);
			info.add(nameText);
			nameText.sync();

			const partnerTagline = new Text();
			partnerTagline.text = partner?.tagline || '';
			partnerTagline.fontSize = 0.2;
			partnerTagline.color = 0xffffff;
			partnerTagline.anchorX = 'center';
			partnerTagline.anchorY = 'middle';
			partnerTagline.position.set(0, -0.3, 0.12);
			info.add(partnerTagline);
			partnerTagline.sync();
		} else if (isShowcase) {
			// Showcase layout: "TanStack Showcase" label, name, and tagline
			const showcaseLabel = new Text();
			showcaseLabel.text = 'TanStack Showcase';
			showcaseLabel.fontSize = 0.16;
			showcaseLabel.color = 0xffffff;
			showcaseLabel.anchorX = 'center';
			showcaseLabel.anchorY = 'middle';
			showcaseLabel.position.set(0, 0.7, 0.12);
			info.add(showcaseLabel);
			showcaseLabel.sync();

			const nameText = new Text();
			nameText.text = name;
			nameText.fontSize = 0.4;
			nameText.color = 0xffffff;
			nameText.anchorX = 'center';
			nameText.anchorY = 'middle';
			nameText.fontWeight = 'bold';
			nameText.position.set(0, 0.2, 0.12);
			info.add(nameText);
			nameText.sync();

			const showcaseTagline = new Text();
			showcaseTagline.text = tagline;
			showcaseTagline.fontSize = 0.18;
			showcaseTagline.color = 0xffffff;
			showcaseTagline.anchorX = 'center';
			showcaseTagline.anchorY = 'middle';
			showcaseTagline.maxWidth = 4.2;
			showcaseTagline.textAlign = 'center';
			showcaseTagline.position.set(0, -0.35, 0.12);
			info.add(showcaseTagline);
			showcaseTagline.sync();
		} else {
			// Library layout: Name and tagline
			const nameText = new Text();
			nameText.text = name;
			nameText.fontSize = 0.4;
			nameText.color = 0xffffff;
			nameText.anchorX = 'center';
			nameText.anchorY = 'middle';
			nameText.fontWeight = 'bold';
			nameText.position.set(0, 0.5, 0.12);
			info.add(nameText);
			nameText.sync();

			const taglineText = new Text();
			taglineText.text = tagline;
			taglineText.fontSize = 0.18;
			taglineText.color = 0xffffff;
			taglineText.anchorX = 'center';
			taglineText.anchorY = 'middle';
			taglineText.maxWidth = 4.2;
			taglineText.textAlign = 'center';
			taglineText.position.set(0, -0.1, 0.12);
			info.add(taglineText);
			taglineText.sync();
		}

		// Framework badges (for libraries)
		if (library?.frameworks && library.frameworks.length > 0) {
			const frameworks = library.frameworks.slice(0, 6);
			const totalWidth = frameworks.length * 0.7;
			const startX = -totalWidth / 2 + 0.35;

			frameworks.forEach((fw, i) => {
				const x = startX + i * 0.7;
				const badgeGeo = new THREE.BoxGeometry(0.6, 0.28, 0.08);
				const badgeMat = new THREE.MeshStandardMaterial({
					color: FRAMEWORK_COLORS[fw] || '#888888',
					transparent: true,
					opacity: 0.9,
				});
				const badge = new THREE.Mesh(badgeGeo, badgeMat);
				badge.position.set(x, -0.7, 0.1);
				info.add(badge);

				const badgeText = new Text();
				badgeText.text = fw.charAt(0).toUpperCase() + fw.slice(1, 5);
				badgeText.fontSize = 0.12;
				badgeText.color = 0xffffff;
				badgeText.anchorX = 'center';
				badgeText.anchorY = 'middle';
				badgeText.position.set(x, -0.7, 0.14);
				info.add(badgeText);
				badgeText.sync();
			});
		}

		// Position above island
		const infoPos = this.calculateInfoPosition(data);
		info.position.set(...infoPos);
		info.rotation.set(-Math.PI * 0.12, Math.PI * 0.25, Math.PI * 0.1);

		info.userData.islandId = data.id;

		return info;
	}

	private calculateInfoPosition(data: IslandData): [number, number, number] {
		return [
			data.position[0] + 1,
			data.position[1] + 0.5 + data.scale * 1.5 + 2.8,
			data.position[2] + 1,
		];
	}

	private createDebugCircle(radius: number, color: number = 0xff0000): THREE.Line {
		const segments = 64;
		const points: THREE.Vector3[] = [];
		for (let i = 0; i <= segments; i++) {
			const angle = (i / segments) * Math.PI * 2;
			points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius));
		}
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
		return new THREE.Line(geometry, material);
	}

	private updateDebugCircles(instance: IslandInstance, show: boolean): void {
		const data = instance.data;

		// Remove existing circles
		for (const circle of instance.debugCircles) {
			circle.parent?.remove(circle);
			circle.geometry.dispose();
			(circle.material as THREE.Material).dispose();
		}
		instance.debugCircles = [];

		if (!show) return;

		// Use precomputed collision data from IslandData
		// Add circles in WORLD space to this.group (which has no transform)

		// Main island circle - uses precomputed collisionRadius
		const mainCircle = this.createDebugCircle(data.collisionRadius, 0xff0000);
		mainCircle.position.set(data.position[0], 0.5, data.position[2]);
		this.group.add(mainCircle);
		instance.debugCircles.push(mainCircle);

		// Lobe circles - use precomputed worldX, worldZ, collisionRadius
		for (const lobe of data.lobes) {
			const lobeCircle = this.createDebugCircle(lobe.collisionRadius, 0x00ff00);
			lobeCircle.position.set(lobe.worldX, 0.5, lobe.worldZ);
			this.group.add(lobeCircle);
			instance.debugCircles.push(lobeCircle);
		}
	}

	update(time: number, boatPosition: [number, number, number]): void {
		const { nearbyIsland, discoveryProgress, discoveredIslands, showCollisionDebug } =
			useGameStore.getState();

		for (const [id, instance] of this.instances) {
			// Distance culling
			const dx = instance.data.position[0] - boatPosition[0];
			const dz = instance.data.position[2] - boatPosition[2];
			const distSq = dx * dx + dz * dz;
			instance.group.visible = distSq < CULL_DISTANCE * CULL_DISTANCE;

			const isDiscovered = discoveredIslands.has(id);
			const isNearby = nearbyIsland?.id === id;

			// Update beacon visibility
			if (instance.beacon) {
				instance.beacon.visible = !isDiscovered;
			}

			// Update flag animation
			if (instance.flagGroup) {
				const flagMesh = instance.flagGroup.userData.flagMesh as THREE.Mesh | undefined;
				if (flagMesh) {
					// Flag position (rises with discovery progress)
					const targetFlagPos = isDiscovered ? 1 : isNearby ? discoveryProgress : 0;
					instance.flagPosition = THREE.MathUtils.lerp(instance.flagPosition, targetFlagPos, 0.1);

					const flagBottomY = 0.4;
					const flagTopY = 2.5 - 0.25 - 0.15;
					const flagY = flagBottomY + instance.flagPosition * (flagTopY - flagBottomY);
					flagMesh.position.y = flagY;
				}

				// Scale animation
				const targetScale = isNearby || isDiscovered ? 1 : 0;
				const stiffness = 200;
				const damping = 15;
				const dt = 0.016; // Approximate 60fps

				const displacement = instance.currentScale - targetScale;
				const springForce = -stiffness * displacement;
				const dampingForce = -damping * instance.scaleVelocity;

				instance.scaleVelocity += (springForce + dampingForce) * dt;
				instance.currentScale += instance.scaleVelocity * dt;
				instance.currentScale = Math.max(0, Math.min(1.3, instance.currentScale));

				const completionScale = isDiscovered ? 1.1 : 1;
				instance.flagGroup.scale.setScalar(
					Math.max(0.001, instance.currentScale * completionScale),
				);

				// Confetti on discovery
				if (isDiscovered && !instance.wasDiscovered) {
					instance.wasDiscovered = true;
					if (!instance.confettiSpawned) {
						instance.confettiSpawned = true;
						this.spawnConfetti(instance);
					}
				}
			}

			// Update info card with scale animation (cull at distance)
			if (instance.infoGroup) {
				const infoVisibleDistance = 80; // Only show info cards within this distance
				const shouldShow =
					(isNearby || isDiscovered) && distSq < infoVisibleDistance * infoVisibleDistance;
				const targetInfoScale = shouldShow ? 1 : 0;

				// Spring animation for info card scale
				const infoStiffness = 180;
				const infoDamping = 12;
				const dt = 0.016;

				const infoDisplacement = instance.infoScale - targetInfoScale;
				const infoSpringForce = -infoStiffness * infoDisplacement;
				const infoDampingForce = -infoDamping * instance.infoScaleVelocity;

				instance.infoScaleVelocity += (infoSpringForce + infoDampingForce) * dt;
				instance.infoScale += instance.infoScaleVelocity * dt;
				instance.infoScale = Math.max(0, Math.min(1.2, instance.infoScale));

				instance.infoGroup.visible = instance.infoScale > 0.01;
				instance.infoGroup.scale.setScalar(Math.max(0.001, instance.infoScale));

				if (instance.infoScale > 0.01) {
					// Bob animation
					instance.infoGroup.position.y =
						this.calculateInfoPosition(instance.data)[1] + Math.sin(time * 1.5) * 0.1;
				}
			}

			// Update confetti
			this.updateConfetti(instance, 0.016);

			// Animate wave rings (pulsing scale)
			if (instance.group.visible) {
				for (const ring of instance.waveRings) {
					const pulse = Math.sin(time * 0.6 + ring.offset) * 0.03;
					const scale = 1 + pulse;
					ring.mesh.scale.set(scale, scale, 1);
				}
			}

			// Update debug collision circles
			const hasDebugCircles = instance.debugCircles.length > 0;
			if (showCollisionDebug !== hasDebugCircles) {
				this.updateDebugCircles(instance, showCollisionDebug);
			}
		}
	}

	private spawnConfetti(instance: IslandInstance): void {
		if (!instance.flagGroup) return;

		const color = instance.flagGroup.userData.color || '#FFD700';
		const baseColor = new THREE.Color(color);
		const hsl = { h: 0, s: 0, l: 0 };
		baseColor.getHSL(hsl);

		const colors = [
			color,
			'#FFFFFF',
			`#${new THREE.Color().setHSL((hsl.h + 0.1) % 1, 0.8, 0.6).getHexString()}`,
			`#${new THREE.Color().setHSL((hsl.h - 0.1 + 1) % 1, 0.8, 0.6).getHexString()}`,
			'#FFD700',
		];

		const flagPos = instance.flagGroup.position.clone();
		flagPos.y += 2.2;

		for (let i = 0; i < 30; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 2 + Math.random() * 3;
			const upSpeed = 3 + Math.random() * 2;

			const geo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
			const mat = new THREE.MeshStandardMaterial({
				color: colors[Math.floor(Math.random() * colors.length)],
				roughness: 0.5,
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position
				.copy(flagPos)
				.add(
					new THREE.Vector3(
						(Math.random() - 0.5) * 0.3,
						Math.random() * 0.2,
						(Math.random() - 0.5) * 0.3,
					),
				);
			mesh.rotation.set(
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2,
				Math.random() * Math.PI * 2,
			);

			this.group.add(mesh);

			instance.confetti.push({
				mesh,
				velocity: new THREE.Vector3(Math.cos(angle) * speed, upSpeed, Math.sin(angle) * speed),
				rotationSpeed: new THREE.Vector3(
					(Math.random() - 0.5) * 10,
					(Math.random() - 0.5) * 10,
					(Math.random() - 0.5) * 10,
				),
				lifetime: 2 + Math.random(),
			});
		}
	}

	private updateConfetti(instance: IslandInstance, dt: number): void {
		instance.confetti = instance.confetti.filter((p) => {
			p.lifetime -= dt;

			if (p.lifetime <= 0 || p.mesh.position.y < -1) {
				this.group.remove(p.mesh);
				p.mesh.geometry.dispose();
				(p.mesh.material as THREE.Material).dispose();
				return false;
			}

			p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
			p.velocity.y -= 9.8 * dt;
			p.velocity.multiplyScalar(0.98);

			p.mesh.rotation.x += p.rotationSpeed.x * dt;
			p.mesh.rotation.y += p.rotationSpeed.y * dt;
			p.mesh.rotation.z += p.rotationSpeed.z * dt;

			p.mesh.scale.setScalar(p.lifetime / 2);

			return true;
		});
	}

	private disposeInstance(instance: IslandInstance): void {
		instance.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry?.dispose();
				if (child.material) {
					(child.material as THREE.Material).dispose();
				}
			}
		});

		if (instance.infoGroup) {
			instance.infoGroup.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (child.material) {
						(child.material as THREE.Material).dispose();
					}
				}
				// @ts-expect-error - troika text
				if (child.dispose) child.dispose();
			});
			this.group.remove(instance.infoGroup);
		}

		if (instance.flagGroup) {
			instance.flagGroup.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (child.material) {
						(child.material as THREE.Material).dispose();
					}
				}
			});
			this.group.remove(instance.flagGroup);
		}

		instance.confetti.forEach((p) => {
			this.group.remove(p.mesh);
			p.mesh.geometry.dispose();
			(p.mesh.material as THREE.Material).dispose();
		});

		// Dispose wave rings
		for (const ring of instance.waveRings) {
			ring.mesh.geometry.dispose();
			(ring.mesh.material as THREE.Material).dispose();
			this.group.remove(ring.mesh);
		}
	}

	dispose(): void {
		for (const instance of this.instances.values()) {
			this.disposeInstance(instance);
		}
		this.instances.clear();
	}
}
