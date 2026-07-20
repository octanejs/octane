import * as THREE from 'three';
import type { IslandData } from '../../utils/islandGenerator';
import { CULL_DISTANCES } from '../../hooks/useDistanceCulling';

interface RockData {
	localPosition: THREE.Vector3;
	scale: THREE.Vector3;
	rotation: THREE.Euler;
	color: THREE.Color;
	foamMesh: THREE.Mesh;
	waterMesh: THREE.Mesh;
	rockMesh: THREE.Mesh;
	rockSize: number;
}

interface RockGroup {
	group: THREE.Group;
	position: THREE.Vector3;
	rocks: RockData[];
}

function seededRandom(seed: number): number {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

const ROCK_COLORS = ['#7A8B8B', '#8B9A9A', '#6B7B7B', '#9AA8A8', '#5C6B6B'];

export class OceanRocks {
	group: THREE.Group;
	private rockGroups: RockGroup[] = [];
	private dodecahedronGeo: THREE.DodecahedronGeometry;
	private ringGeoCache: Map<string, THREE.RingGeometry> = new Map();

	constructor() {
		this.group = new THREE.Group();
		this.dodecahedronGeo = new THREE.DodecahedronGeometry(1, 0);
	}

	private getRingGeometry(inner: number, outer: number): THREE.RingGeometry {
		const key = `${inner.toFixed(2)}-${outer.toFixed(2)}`;
		let geo = this.ringGeoCache.get(key);
		if (!geo) {
			geo = new THREE.RingGeometry(inner, outer, 16);
			this.ringGeoCache.set(key, geo);
		}
		return geo;
	}

	generate(islands: IslandData[], groupCount: number, spread: number): void {
		// Clear existing
		this.dispose();
		this.group = new THREE.Group();
		this.rockGroups = [];

		const minDistFromIsland = 10;

		for (let g = 0; g < groupCount; g++) {
			const groupSeed = g * 54321;

			const groupX = (seededRandom(groupSeed) - 0.5) * spread;
			const groupZ = (seededRandom(groupSeed + 1) - 0.5) * spread;

			// Check distance from islands
			let tooClose = false;
			for (const island of islands) {
				const dx = groupX - island.position[0];
				const dz = groupZ - island.position[2];
				if (dx * dx + dz * dz < minDistFromIsland * minDistFromIsland) {
					tooClose = true;
					break;
				}
			}
			if (tooClose) continue;

			const rockCount = 1 + Math.floor(seededRandom(groupSeed + 2) * 4);
			const groupObj = new THREE.Group();
			groupObj.position.set(groupX, 0, groupZ);

			const rocks: RockData[] = [];

			for (let r = 0; r < rockCount; r++) {
				const rockSeed = groupSeed + r * 100;

				const offsetDist = r === 0 ? 0 : 1.2 + seededRandom(rockSeed) * 1.0;
				const offsetAngle = seededRandom(rockSeed + 1) * Math.PI * 2;
				const localX = Math.cos(offsetAngle) * offsetDist;
				const localZ = Math.sin(offsetAngle) * offsetDist;

				const sizeMultiplier = r === 0 ? 1 : 0.4 + seededRandom(rockSeed + 2) * 0.5;
				const baseScale = (0.25 + seededRandom(rockSeed + 3) * 0.55) * sizeMultiplier;

				const scaleX = baseScale * (0.8 + seededRandom(rockSeed + 4) * 0.4);
				const scaleY = baseScale * (0.4 + seededRandom(rockSeed + 5) * 0.4);
				const scaleZ = baseScale * (0.8 + seededRandom(rockSeed + 6) * 0.4);
				const rockSize = Math.max(scaleX, scaleZ);

				const colorIdx = Math.floor(seededRandom(rockSeed + 10) * ROCK_COLORS.length);
				const color = new THREE.Color(ROCK_COLORS[colorIdx]);

				// Rock mesh
				const rockMat = new THREE.MeshStandardMaterial({
					color,
					roughness: 0.9,
				});
				const rockMesh = new THREE.Mesh(this.dodecahedronGeo, rockMat);
				rockMesh.scale.set(scaleX, scaleY, scaleZ);
				rockMesh.rotation.set(
					seededRandom(rockSeed + 7) * 0.4,
					seededRandom(rockSeed + 8) * Math.PI * 2,
					seededRandom(rockSeed + 9) * 0.4,
				);
				rockMesh.position.set(localX, -0.5 - baseScale * 0.1, localZ);
				rockMesh.castShadow = true;
				rockMesh.receiveShadow = true;
				groupObj.add(rockMesh);

				// Foam ring - thinner and more subtle
				const foamGeo = this.getRingGeometry(rockSize * 1.0, rockSize * 1.15);
				const foamMat = new THREE.MeshStandardMaterial({
					color: '#FFFFFF',
					transparent: true,
					opacity: 0.25,
					depthWrite: false,
				});
				const foamMesh = new THREE.Mesh(foamGeo, foamMat);
				foamMesh.rotation.x = -Math.PI / 2;
				foamMesh.position.set(localX, -0.6, localZ);
				foamMesh.renderOrder = -1;
				groupObj.add(foamMesh);

				// Water ring - thinner and more subtle
				const waterGeo = this.getRingGeometry(rockSize * 1.15, rockSize * 1.3);
				const waterMat = new THREE.MeshStandardMaterial({
					color: '#40E0D0',
					transparent: true,
					opacity: 0.15,
					depthWrite: false,
				});
				const waterMesh = new THREE.Mesh(waterGeo, waterMat);
				waterMesh.rotation.x = -Math.PI / 2;
				waterMesh.position.set(localX, -0.65, localZ);
				waterMesh.renderOrder = -1;
				groupObj.add(waterMesh);

				rocks.push({
					localPosition: new THREE.Vector3(localX, -0.1 - baseScale * 0.1, localZ),
					scale: new THREE.Vector3(scaleX, scaleY, scaleZ),
					rotation: new THREE.Euler(
						seededRandom(rockSeed + 7) * 0.4,
						seededRandom(rockSeed + 8) * Math.PI * 2,
						seededRandom(rockSeed + 9) * 0.4,
					),
					color,
					foamMesh,
					waterMesh,
					rockMesh,
					rockSize,
				});
			}

			this.rockGroups.push({
				group: groupObj,
				position: new THREE.Vector3(groupX, 0, groupZ),
				rocks,
			});
			this.group.add(groupObj);
		}
	}

	update(time: number, boatPosition: [number, number, number]): void {
		const maxDistSq = CULL_DISTANCES.rock * CULL_DISTANCES.rock;

		for (let gi = 0; gi < this.rockGroups.length; gi++) {
			const rockGroup = this.rockGroups[gi];
			const dx = rockGroup.position.x - boatPosition[0];
			const dz = rockGroup.position.z - boatPosition[2];
			const distSq = dx * dx + dz * dz;

			const visible = distSq < maxDistSq;
			rockGroup.group.visible = visible;

			if (!visible) continue;

			// Bob the group
			const offset = gi * 0.7;
			rockGroup.group.position.y = Math.sin(time * 0.4 + offset) * 0.04;

			// Animate foam/water rings
			for (let ri = 0; ri < rockGroup.rocks.length; ri++) {
				const rock = rockGroup.rocks[ri];
				const phase = gi * 10 + ri * 0.7;
				const foamScale = 1 + Math.sin(time * 0.8 + phase) * 0.12;
				const waterScale = 1 + Math.sin(time * 0.8 + phase + 0.5) * 0.1;

				rock.foamMesh.scale.set(foamScale, foamScale, 1);
				rock.waterMesh.scale.set(waterScale, waterScale, 1);
			}
		}
	}

	dispose(): void {
		this.rockGroups.forEach((rg) => {
			rg.rocks.forEach((rock) => {
				rock.rockMesh.geometry.dispose();
				(rock.rockMesh.material as THREE.Material).dispose();
				(rock.foamMesh.material as THREE.Material).dispose();
				(rock.waterMesh.material as THREE.Material).dispose();
			});
		});

		this.rockGroups = [];
		this.group.clear();

		this.ringGeoCache.forEach((geo) => geo.dispose());
		this.ringGeoCache.clear();
	}
}
