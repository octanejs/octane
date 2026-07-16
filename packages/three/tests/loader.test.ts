import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useLoader } from '@octanejs/three';
import { createThreeTestRenderer, type ThreeTestRenderer } from '@octanejs/three/testing';
import { ArrayLoaderBoundary, ModelLoaderBoundary } from './_fixtures/loader.three.tsrx';

interface ModelAsset {
	readonly scene: THREE.Group;
}

interface PendingLoad<T> {
	readonly resolve: (value: T) => void;
	readonly progress: ((event: ProgressEvent<EventTarget>) => void) | undefined;
	readonly reject: (error: unknown) => void;
}

class ModelLoader extends THREE.Loader<ModelAsset, string> {
	static current: ModelLoader | null = null;
	readonly requests: string[] = [];
	readonly pending = new Map<string, PendingLoad<ModelAsset>>();

	constructor() {
		super();
		ModelLoader.current = this;
	}

	override load(
		url: string,
		onLoad: (data: ModelAsset) => void,
		onProgress?: (event: ProgressEvent<EventTarget>) => void,
		onError?: (error: unknown) => void,
	): void {
		this.requests.push(url);
		this.pending.set(url, {
			resolve: onLoad,
			progress: onProgress,
			reject: onError ?? (() => {}),
		});
	}

	resolve(url: string, value: ModelAsset): void {
		const pending = this.pending.get(url);
		if (pending === undefined) throw new Error(`No pending model request for ${url}`);
		this.pending.delete(url);
		pending.resolve(value);
	}

	reject(url: string, error: unknown): void {
		const pending = this.pending.get(url);
		if (pending === undefined) throw new Error(`No pending model request for ${url}`);
		this.pending.delete(url);
		pending.reject(error);
	}
}

interface TextAsset {
	readonly url: string;
}

class TextLoader extends THREE.Loader<TextAsset, string> {
	readonly requests: string[] = [];
	readonly pending = new Map<string, PendingLoad<TextAsset>>();

	override load(
		url: string,
		onLoad: (data: TextAsset) => void,
		onProgress?: (event: ProgressEvent<EventTarget>) => void,
		onError?: (error: unknown) => void,
	): void {
		this.requests.push(url);
		this.pending.set(url, {
			resolve: onLoad,
			progress: onProgress,
			reject: onError ?? (() => {}),
		});
	}

	progress(url: string, event: ProgressEvent<EventTarget>): void {
		const pending = this.pending.get(url);
		if (pending === undefined) throw new Error(`No pending text request for ${url}`);
		pending.progress?.(event);
	}

	resolve(url: string, value: TextAsset): void {
		const pending = this.pending.get(url);
		if (pending === undefined) throw new Error(`No pending text request for ${url}`);
		this.pending.delete(url);
		pending.resolve(value);
	}
}

async function flushUniversalWork(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

function model(name: string): {
	readonly asset: ModelAsset;
	readonly mesh: THREE.Mesh;
	readonly dispose: ReturnType<typeof vi.fn>;
} {
	const scene = new THREE.Group();
	const dispose = vi.fn();
	Object.assign(scene, { dispose });
	const material = new THREE.MeshBasicMaterial();
	material.name = `${name}-material`;
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
	mesh.name = name;
	scene.add(mesh);
	return { asset: { scene }, mesh, dispose };
}

describe('useLoader', () => {
	it('suspends for a constructor loader, augments model graphs, and reuses cached assets', async () => {
		const input = '/models/hero.glb';
		const extensions: ModelLoader[] = [];
		const loaded: Array<ModelAsset & { nodes: Record<string, THREE.Object3D> }> = [];
		const roots: ThreeTestRenderer[] = [];
		const props = {
			loader: ModelLoader,
			input,
			extensions: (loader: ModelLoader) => extensions.push(loader),
			onProgress: undefined,
			onLoad: (asset: ModelAsset & { nodes: Record<string, THREE.Object3D> }) => loaded.push(asset),
		};

		try {
			const firstRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(firstRoot);
			expect(firstRoot.scene.children.map((child) => child.name)).toEqual(['loading']);
			const loader = ModelLoader.current;
			expect(loader).not.toBeNull();
			expect(loader?.requests).toEqual([input]);

			const first = model('Hero');
			loader?.resolve(input, first.asset);
			await flushUniversalWork();

			expect(firstRoot.scene.children).toEqual([first.asset.scene]);
			expect(loaded.at(-1)?.nodes.Hero).toBe(first.mesh);
			expect(loaded.at(-1)?.materials['Hero-material']).toBe(first.mesh.material);
			firstRoot.unmount();
			expect(first.dispose).not.toHaveBeenCalled();

			const cachedRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(cachedRoot);
			expect(cachedRoot.scene.children).toEqual([first.asset.scene]);
			expect(loader?.requests).toEqual([input]);
			expect(loaded.at(-1)).toBe(first.asset);
			cachedRoot.unmount();
			expect(first.dispose).not.toHaveBeenCalled();

			useLoader.clear(ModelLoader, input);
			expect(first.dispose).not.toHaveBeenCalled();
			const reloadedRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(reloadedRoot);
			expect(reloadedRoot.scene.children.map((child) => child.name)).toEqual(['loading']);
			expect(loader?.requests).toEqual([input, input]);

			const second = model('Replacement');
			loader?.resolve(input, second.asset);
			await flushUniversalWork();
			expect(reloadedRoot.scene.children).toEqual([second.asset.scene]);
			expect(loaded.at(-1)?.nodes.Replacement).toBe(second.mesh);
			expect(extensions).toEqual([loader, loader]);
			reloadedRoot.unmount();
			useLoader.clear(ModelLoader, input);
			expect(second.dispose).not.toHaveBeenCalled();
		} finally {
			for (const root of roots) root.unmount();
			useLoader.clear(ModelLoader, input);
		}
	});

	it('loads arrays in input order with an existing loader and forwards progress', async () => {
		const loader = new TextLoader();
		const inputs = ['/first.txt', '/second.txt'];
		const extensions = vi.fn();
		const onProgress = vi.fn();
		const loaded: TextAsset[][] = [];
		const roots: ThreeTestRenderer[] = [];
		const props = {
			loader,
			input: inputs,
			extensions,
			onProgress,
			onLoad: (assets: TextAsset[]) => loaded.push(assets),
		};

		try {
			const firstRoot = await createThreeTestRenderer(ArrayLoaderBoundary, props);
			roots.push(firstRoot);
			expect(firstRoot.scene.children.map((child) => child.name)).toEqual(['loading']);
			expect(loader.requests).toEqual(inputs);
			expect(extensions).toHaveBeenCalledWith(loader);

			const progress = new ProgressEvent('progress', { loaded: 1, total: 2 });
			loader.progress(inputs[0], progress);
			expect(onProgress).toHaveBeenCalledWith(progress);

			const first = { url: inputs[0] };
			const second = { url: inputs[1] };
			loader.resolve(inputs[1], second);
			loader.resolve(inputs[0], first);
			await flushUniversalWork();
			expect(loaded).toEqual([[first, second]]);
			expect(firstRoot.scene.children.map((child) => child.name)).toEqual(['loaded-array']);
			firstRoot.unmount();

			const cachedRoot = await createThreeTestRenderer(ArrayLoaderBoundary, {
				...props,
				input: [...inputs],
			});
			roots.push(cachedRoot);
			expect(cachedRoot.scene.children.map((child) => child.name)).toEqual(['loaded-array']);
			expect(loader.requests).toEqual(inputs);
			expect(extensions).toHaveBeenCalledTimes(1);
		} finally {
			for (const root of roots) root.unmount();
			useLoader.clear(loader, inputs);
		}
	});

	it('shares preloaded requests, exposes loader errors, and retries only after clear', async () => {
		const loader = new ModelLoader();
		const input = '/models/broken.glb';
		const preloadExtension = vi.fn();
		const renderExtension = vi.fn();
		const roots: ThreeTestRenderer[] = [];
		const props = {
			loader,
			input,
			extensions: renderExtension,
			onProgress: undefined,
			onLoad: vi.fn(),
		};

		try {
			useLoader.preload(loader, input, preloadExtension);
			expect(loader.requests).toEqual([input]);
			expect(preloadExtension).toHaveBeenCalledWith(loader);

			const firstRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(firstRoot);
			expect(loader.requests).toEqual([input]);
			expect(renderExtension).not.toHaveBeenCalled();

			loader.reject(input, new Error('network down'));
			await flushUniversalWork();
			expect(firstRoot.scene.children.map((child) => child.name)).toEqual([
				'error:Could not load /models/broken.glb: network down',
			]);
			firstRoot.unmount();

			const cachedErrorRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(cachedErrorRoot);
			expect(cachedErrorRoot.scene.children.map((child) => child.name)).toEqual([
				'error:Could not load /models/broken.glb: network down',
			]);
			expect(loader.requests).toEqual([input]);
			cachedErrorRoot.unmount();

			useLoader.clear(loader, input);
			const retryRoot = await createThreeTestRenderer(ModelLoaderBoundary, props);
			roots.push(retryRoot);
			expect(retryRoot.scene.children.map((child) => child.name)).toEqual(['loading']);
			expect(loader.requests).toEqual([input, input]);

			const recovered = model('Recovered');
			loader.resolve(input, recovered.asset);
			await flushUniversalWork();
			expect(retryRoot.scene.children).toEqual([recovered.asset.scene]);
			expect(renderExtension).toHaveBeenCalledWith(loader);
		} finally {
			for (const root of roots) root.unmount();
			useLoader.clear(loader, input);
		}
	});
});
