import * as THREE from 'three';
import { useGameStore } from '../../hooks/useGameStore';

const PLANE_SIZE = 100;
const PLANE_OPACITY = 0.6;

type Edge = 'north' | 'south' | 'east' | 'west';

interface BoundaryPlane {
	mesh: THREE.Mesh;
	edge: Edge;
	material: THREE.MeshBasicMaterial;
}

export class BoundaryWalls {
	group: THREE.Group;
	private planes: BoundaryPlane[] = [];
	private planeGeometry: THREE.PlaneGeometry;

	constructor() {
		this.group = new THREE.Group();
		this.planeGeometry = new THREE.PlaneGeometry(100, 100);

		const edges: Edge[] = ['north', 'south', 'east', 'west'];
		for (const edge of edges) {
			const material = new THREE.MeshBasicMaterial({
				color: '#dd4444',
				transparent: true,
				opacity: 0,
				side: THREE.DoubleSide,
				depthTest: false,
			});

			const mesh = new THREE.Mesh(this.planeGeometry, material);
			mesh.rotation.x = -Math.PI / 2;
			mesh.visible = false;
			mesh.renderOrder = 999;

			this.planes.push({ mesh, edge, material });
			this.group.add(mesh);
		}
	}

	update(delta: number): void {
		const { boundaryEdges, worldBoundary, phase } = useGameStore.getState();

		for (const plane of this.planes) {
			// Hide when not playing
			if (phase !== 'playing') {
				plane.mesh.visible = false;
				continue;
			}

			const active = boundaryEdges[plane.edge];
			const targetOpacity = active ? PLANE_OPACITY : 0;

			// Lerp opacity
			plane.material.opacity = THREE.MathUtils.lerp(
				plane.material.opacity,
				targetOpacity,
				delta * 6,
			);
			plane.mesh.visible = plane.material.opacity > 0.01;

			// Update position based on dynamic world boundary
			const planeWidth = worldBoundary * 2 + PLANE_SIZE * 2;
			const planeY = 0.5;

			switch (plane.edge) {
				case 'north':
					plane.mesh.position.set(0, planeY, worldBoundary + PLANE_SIZE / 2);
					plane.mesh.scale.set(planeWidth / 100, PLANE_SIZE / 100, 1);
					break;
				case 'south':
					plane.mesh.position.set(0, planeY, -worldBoundary - PLANE_SIZE / 2);
					plane.mesh.scale.set(planeWidth / 100, PLANE_SIZE / 100, 1);
					break;
				case 'east':
					plane.mesh.position.set(worldBoundary + PLANE_SIZE / 2, planeY, 0);
					plane.mesh.scale.set(PLANE_SIZE / 100, planeWidth / 100, 1);
					break;
				case 'west':
					plane.mesh.position.set(-worldBoundary - PLANE_SIZE / 2, planeY, 0);
					plane.mesh.scale.set(PLANE_SIZE / 100, planeWidth / 100, 1);
					break;
			}
		}
	}

	dispose(): void {
		this.planeGeometry.dispose();
		this.planes.forEach((p) => p.material.dispose());
		this.planes = [];
		this.group.clear();
	}
}
