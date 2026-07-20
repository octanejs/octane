import * as THREE from 'three';
import { modelLoader } from '../loaders/ModelLoader';
import { getWaveHeight } from './Ocean';
import { CULL_DISTANCES } from '../../hooks/useDistanceCulling';
import { useGameStore, type OtherPlayer } from '../../hooks/useGameStore';

interface AIShipData {
	id: string;
	group: THREE.Group;
	model: THREE.Group;
	color: THREE.Color;
}

export class AIShips {
	group: THREE.Group;
	private ships: Map<string, AIShipData> = new Map();
	private cannonGeometries: {
		base: THREE.CylinderGeometry;
		barrel: THREE.CylinderGeometry;
	};

	constructor() {
		this.group = new THREE.Group();

		// Shared cannon geometries
		this.cannonGeometries = {
			base: new THREE.CylinderGeometry(0.07, 0.09, 0.05, 12),
			barrel: new THREE.CylinderGeometry(0.035, 0.045, 0.22, 12),
		};
	}

	spawn(_count: number): void {
		const _otherPlayers = useGameStore.getState().otherPlayers;
		// Ships will be created in updatePlayers when AI system adds them
	}

	private createShip(player: OtherPlayer): AIShipData {
		const tintColor = new THREE.Color(player.color);
		const model = modelLoader.clone('/models/ship.glb', tintColor);
		model.scale.setScalar(0.32);

		const group = new THREE.Group();
		group.add(model);

		// Add cannon
		const cannonGroup = new THREE.Group();
		cannonGroup.position.set(0.35, 0.28, 0);

		const baseMat = new THREE.MeshStandardMaterial({
			color: '#4a4a4a',
			metalness: 0.8,
			roughness: 0.3,
		});
		const baseMesh = new THREE.Mesh(this.cannonGeometries.base, baseMat);
		baseMesh.castShadow = true;
		cannonGroup.add(baseMesh);

		const barrelMat = new THREE.MeshStandardMaterial({
			color: '#3a3a3a',
			metalness: 0.9,
			roughness: 0.2,
		});
		const barrelMesh = new THREE.Mesh(this.cannonGeometries.barrel, barrelMat);
		barrelMesh.position.set(0.12, 0.02, 0);
		barrelMesh.rotation.z = Math.PI / 2;
		barrelMesh.castShadow = true;
		cannonGroup.add(barrelMesh);

		group.add(cannonGroup);

		return {
			id: player.id,
			group,
			model,
			color: tintColor,
		};
	}

	updatePlayers(players: OtherPlayer[]): void {
		const aiPlayers = players.filter((p) => p.isAI);
		const currentIds = new Set(aiPlayers.map((p) => p.id));

		// Remove ships that no longer exist
		for (const [id, ship] of this.ships) {
			if (!currentIds.has(id)) {
				this.group.remove(ship.group);
				this.disposeShip(ship);
				this.ships.delete(id);
			}
		}

		// Add new ships
		for (const player of aiPlayers) {
			if (!this.ships.has(player.id)) {
				const ship = this.createShip(player);
				this.ships.set(player.id, ship);
				this.group.add(ship.group);
			}
		}
	}

	update(time: number): void {
		const { boatPosition, otherPlayers, stage } = useGameStore.getState();

		if (stage !== 'battle') {
			this.group.visible = false;
			return;
		}
		this.group.visible = true;

		const maxDistSq = CULL_DISTANCES.ship * CULL_DISTANCES.ship;

		for (const player of otherPlayers) {
			if (!player.isAI) continue;

			const ship = this.ships.get(player.id);
			if (!ship) continue;

			// Distance culling
			const dx = player.position[0] - boatPosition[0];
			const dz = player.position[2] - boatPosition[2];
			const distSq = dx * dx + dz * dz;
			ship.group.visible = distSq < maxDistSq;

			if (!ship.group.visible) continue;

			// Update position with wave height and bob
			const [px, _py, pz] = player.position;
			const waveY = getWaveHeight(px, pz, time);
			const bobY = Math.sin(time * 1.8 + px * 0.1) * 0.03;
			const bobRoll = Math.sin(time * 1.5 + pz * 0.1) * 0.03;
			const bobPitch = Math.sin(time * 2.2) * 0.02;

			const waveTiltX = getWaveHeight(px + 0.3, pz, time) - waveY;
			const waveTiltZ = getWaveHeight(px, pz + 0.3, time) - waveY;

			ship.group.position.set(px, waveY + bobY + 0.2, pz);
			ship.group.rotation.set(
				bobPitch + waveTiltZ * 0.4,
				player.rotation,
				bobRoll + waveTiltX * 0.4,
			);
		}
	}

	private disposeShip(ship: AIShipData): void {
		ship.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry?.dispose();
				if (child.material) {
					const mat = child.material as THREE.MeshStandardMaterial;
					mat.map?.dispose();
					mat.dispose();
				}
			}
		});
	}

	dispose(): void {
		this.ships.forEach((ship) => {
			this.disposeShip(ship);
		});
		this.ships.clear();
		this.group.clear();

		this.cannonGeometries.base.dispose();
		this.cannonGeometries.barrel.dispose();
	}
}
