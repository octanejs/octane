import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

class ModelLoaderSingleton {
	private loader: GLTFLoader;
	private cache: Map<string, GLTF> = new Map();
	private loading: Map<string, Promise<GLTF>> = new Map();

	constructor() {
		this.loader = new GLTFLoader();
	}

	async load(url: string): Promise<GLTF> {
		// Return from cache if available
		const cached = this.cache.get(url);
		if (cached) return cached;

		// Return existing promise if already loading
		const existing = this.loading.get(url);
		if (existing) return existing;

		// Start loading
		const promise = new Promise<GLTF>((resolve, reject) => {
			this.loader.load(
				url,
				(gltf) => {
					this.cache.set(url, gltf);
					this.loading.delete(url);
					resolve(gltf);
				},
				undefined,
				(error) => {
					this.loading.delete(url);
					reject(error);
				},
			);
		});

		this.loading.set(url, promise);
		return promise;
	}

	clone(url: string, tintColor?: THREE.Color): THREE.Group {
		const cached = this.cache.get(url);
		if (!cached) {
			throw new Error(`Model not loaded: ${url}. Call load() first.`);
		}

		const clone = cached.scene.clone();

		clone.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;

				if (child.material) {
					child.material = child.material.clone();
					const mat = child.material as THREE.MeshStandardMaterial;

					if (tintColor && mat.color) {
						mat.color.multiply(tintColor);
					}

					if (mat.map) {
						mat.map.minFilter = THREE.LinearMipmapLinearFilter;
						mat.map.magFilter = THREE.LinearFilter;
						mat.map.generateMipmaps = true;
						mat.map.anisotropy = 16;
						mat.map.needsUpdate = true;
					}
				}
			}
		});

		return clone;
	}

	isLoaded(url: string): boolean {
		return this.cache.has(url);
	}

	dispose(): void {
		this.cache.forEach((gltf) => {
			gltf.scene.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (child.material) {
						const mat = child.material as THREE.MeshStandardMaterial;
						mat.map?.dispose();
						mat.dispose();
					}
				}
			});
		});
		this.cache.clear();
		this.loading.clear();
	}
}

export const modelLoader = new ModelLoaderSingleton();

// Preload common models
export async function preloadModels(): Promise<void> {
	await Promise.all([
		modelLoader.load('/models/rowboat.glb'),
		modelLoader.load('/models/ship.glb'),
		modelLoader.load('/models/palm-tree.glb'),
	]);
}
