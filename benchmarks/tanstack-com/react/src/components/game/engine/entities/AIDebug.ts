import * as THREE from 'three';
import { useGameStore } from '../../hooks/useGameStore';
import type { AISystem } from '../systems/AISystem';

export class AIDebug {
	group: THREE.Group;
	private circles: Map<string, THREE.Line> = new Map();
	private homeMarkers: Map<string, THREE.Mesh> = new Map();
	private aiSystem: AISystem | null = null;

	constructor() {
		this.group = new THREE.Group();
		this.group.visible = false;
	}

	setAISystem(system: AISystem): void {
		this.aiSystem = system;
	}

	update(): void {
		const { showCollisionDebug, stage } = useGameStore.getState();

		// Only show in debug mode and battle stage
		this.group.visible = showCollisionDebug && stage === 'battle';

		if (!this.group.visible || !this.aiSystem) return;

		const territories = this.aiSystem.getDebugTerritories();

		// Update or create territory circles
		for (const territory of territories) {
			const { id, homePosition, color, leashRadius } = territory;

			// Territory circle - recreate if radius changed or doesn't exist
			const existingCircle = this.circles.get(id);
			const needsNewCircle = !existingCircle || existingCircle.userData.leashRadius !== leashRadius;

			if (needsNewCircle) {
				// Remove old circle if exists
				if (existingCircle) {
					this.group.remove(existingCircle);
					existingCircle.geometry.dispose();
					(existingCircle.material as THREE.Material).dispose();
				}

				const geometry = new THREE.BufferGeometry();
				const segments = 64;
				const positions = new Float32Array((segments + 1) * 3);

				for (let i = 0; i <= segments; i++) {
					const theta = (i / segments) * Math.PI * 2;
					positions[i * 3] = Math.cos(theta) * leashRadius;
					positions[i * 3 + 1] = 0.5; // Slightly above water
					positions[i * 3 + 2] = Math.sin(theta) * leashRadius;
				}

				geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

				const material = new THREE.LineBasicMaterial({
					color: new THREE.Color(color),
					transparent: true,
					opacity: 0.4,
				});

				const circle = new THREE.Line(geometry, material);
				circle.position.set(homePosition[0], 0, homePosition[1]);
				circle.userData.leashRadius = leashRadius;
				this.circles.set(id, circle);
				this.group.add(circle);
			} else {
				existingCircle.position.set(homePosition[0], 0, homePosition[1]);
			}

			// Home marker (small sphere)
			if (!this.homeMarkers.has(id)) {
				const geometry = new THREE.SphereGeometry(1.5, 16, 16);
				const material = new THREE.MeshBasicMaterial({
					color: new THREE.Color(color),
					transparent: true,
					opacity: 0.3,
				});
				const marker = new THREE.Mesh(geometry, material);
				marker.position.set(homePosition[0], 0.5, homePosition[1]);
				this.homeMarkers.set(id, marker);
				this.group.add(marker);
			} else {
				const marker = this.homeMarkers.get(id)!;
				marker.position.set(homePosition[0], 0.5, homePosition[1]);
			}
		}

		// Remove circles/markers for AIs that no longer exist
		const currentIds = new Set(territories.map((t) => t.id));
		for (const [id, circle] of this.circles) {
			if (!currentIds.has(id)) {
				this.group.remove(circle);
				circle.geometry.dispose();
				(circle.material as THREE.Material).dispose();
				this.circles.delete(id);
			}
		}
		for (const [id, marker] of this.homeMarkers) {
			if (!currentIds.has(id)) {
				this.group.remove(marker);
				marker.geometry.dispose();
				(marker.material as THREE.Material).dispose();
				this.homeMarkers.delete(id);
			}
		}
	}

	dispose(): void {
		for (const circle of this.circles.values()) {
			circle.geometry.dispose();
			(circle.material as THREE.Material).dispose();
		}
		for (const marker of this.homeMarkers.values()) {
			marker.geometry.dispose();
			(marker.material as THREE.Material).dispose();
		}
		this.circles.clear();
		this.homeMarkers.clear();
	}
}
