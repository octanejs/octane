import * as THREE from 'three';
import { useGameStore } from '../../hooks/useGameStore';

const BASE_FOV = 20;
const _DEBUG_ZOOM_HEIGHT = 400;
const DEBUG_ZOOM_FOV = 45;

export class CameraSystem {
	private camera: THREE.PerspectiveCamera;
	private offset: THREE.Vector3;
	private targetPosition: THREE.Vector3;
	private currentPosition: THREE.Vector3;
	private currentFov: number;
	private wasDebugZoom: boolean = false;

	constructor(camera: THREE.PerspectiveCamera) {
		this.camera = camera;
		this.offset = new THREE.Vector3(22, 20, 20);
		this.targetPosition = new THREE.Vector3();
		this.currentPosition = new THREE.Vector3(22, 15, 22);
		this.currentFov = BASE_FOV;

		// Set initial FOV
		this.camera.fov = BASE_FOV;
		this.camera.updateProjectionMatrix();
	}

	update(_delta: number, _time: number): void {
		const { boatPosition, shipStats, debugZoomOut } = useGameStore.getState();

		// Debug zoom out mode - bird's eye view of entire map
		if (debugZoomOut) {
			// Extend far plane for debug view
			if (!this.wasDebugZoom) {
				this.camera.far = 2000;
				this.camera.updateProjectionMatrix();
				this.wasDebugZoom = true;
			}

			const targetFov = DEBUG_ZOOM_FOV;
			if (Math.abs(this.currentFov - targetFov) > 0.1) {
				this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, 0.05);
				this.camera.fov = this.currentFov;
				this.camera.updateProjectionMatrix();
			}

			// Position camera higher but keep isometric angle, still follow boat
			const zoomOffset = 4; // Multiplier for normal offset
			this.targetPosition.set(
				boatPosition[0] + this.offset.x * zoomOffset,
				this.offset.y * zoomOffset,
				boatPosition[2] + this.offset.z * zoomOffset,
			);
			this.currentPosition.lerp(this.targetPosition, 0.05);
			this.camera.position.copy(this.currentPosition);
			this.camera.lookAt(boatPosition[0], 0, boatPosition[2]);
			return;
		}

		// Restore normal far plane when exiting debug zoom
		if (this.wasDebugZoom) {
			this.camera.far = 1000;
			this.camera.updateProjectionMatrix();
			this.wasDebugZoom = false;
		}

		// Normal mode - Update FOV based on fieldOfView upgrade
		const targetFov = BASE_FOV * shipStats.fieldOfView;
		if (Math.abs(this.currentFov - targetFov) > 0.01) {
			this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, 0.1);
			this.camera.fov = this.currentFov;
			this.camera.updateProjectionMatrix();
		}

		// Target position follows boat
		this.targetPosition.set(
			boatPosition[0] + this.offset.x,
			this.offset.y,
			boatPosition[2] + this.offset.z,
		);

		// Smooth camera follow
		this.currentPosition.lerp(this.targetPosition, 0.05);
		this.camera.position.copy(this.currentPosition);

		// Look at boat position
		this.camera.lookAt(boatPosition[0], 0, boatPosition[2]);
	}
}
