import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import { Splat as ReactSplat } from '@react-three/drei/core/Splat.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Splat, type TargetMesh } from '../src/index.js';
import { SplatScene } from './_fixtures/splat.three.tsrx';

type WorkerRecord = {
	listeners: Set<(event: MessageEvent<{ key: string; indices: Uint32Array }>) => void>;
	messages: Array<Record<string, any>>;
	vertexCount: number;
};

const workers: WorkerRecord[] = [];
const fetchCalls: string[] = [];
const textureUploads: Array<{ width: number; height: number; offset: number }> = [];

class MockWorker {
	record: WorkerRecord = { listeners: new Set(), messages: [], vertexCount: 0 };
	constructor() {
		workers.push(this.record);
	}
	addEventListener(
		_type: string,
		listener: (event: MessageEvent<{ key: string; indices: Uint32Array }>) => void,
	) {
		this.record.listeners.add(listener);
	}
	removeEventListener(
		_type: string,
		listener: (event: MessageEvent<{ key: string; indices: Uint32Array }>) => void,
	) {
		this.record.listeners.delete(listener);
	}
	postMessage(message: Record<string, any>) {
		this.record.messages.push(message);
		if (message.method === 'push')
			this.record.vertexCount += new Float32Array(message.matrices).length / 16;
		if (message.method === 'sort') {
			const indices = Uint32Array.from(
				{ length: this.record.vertexCount },
				(_, index) => this.record.vertexCount - index - 1,
			);
			queueMicrotask(() => {
				const event = { data: { key: message.key, indices } } as MessageEvent<{
					key: string;
					indices: Uint32Array;
				}>;
				for (const listener of this.record.listeners) listener(event);
			});
		}
	}
}

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function splatBytes(): Uint8Array {
	const buffer = new ArrayBuffer(64);
	const floats = new Float32Array(buffer);
	for (let index = 0; index < 2; index++) {
		floats[index * 8] = index + 1;
		floats[index * 8 + 1] = index + 2;
		floats[index * 8 + 2] = -(index + 3);
		floats[index * 8 + 3] = 1;
		floats[index * 8 + 4] = 1.5;
		floats[index * 8 + 5] = 2;
	}
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < 2; index++) {
		bytes[index * 32 + 24] = 255;
		bytes[index * 32 + 25] = 128;
		bytes[index * 32 + 26] = 64;
		bytes[index * 32 + 27] = 220;
		bytes[index * 32 + 28] = 255;
		bytes[index * 32 + 29] = 128;
		bytes[index * 32 + 30] = 128;
		bytes[index * 32 + 31] = 128;
	}
	return bytes;
}

function renderer(canvas: HTMLCanvasElement) {
	const context = {
		MAX_TEXTURE_SIZE: 0x0d33,
		TEXTURE_2D: 0x0de1,
		RGBA: 0x1908,
		RGBA_INTEGER: 0x8d99,
		FLOAT: 0x1406,
		UNSIGNED_INT: 0x1405,
		getParameter: () => 4,
		bindTexture() {},
		texSubImage2D(
			_target: number,
			_level: number,
			_x: number,
			_y: number,
			width: number,
			height: number,
			_format: number,
			_type: number,
			_data: ArrayBufferView,
			offset: number,
		) {
			textureUploads.push({ width, height, offset });
		},
	};
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		properties: { get: () => ({ __webglTexture: {} }) },
		getContext: () => context,
		getCurrentViewport: (viewport: THREE.Vector4) => viewport.set(0, 0, 400, 200),
		resetState() {},
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

async function flush(wait = 0): Promise<void> {
	await act(async () => {
		if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
		for (let index = 0; index < 12; index++) await Promise.resolve();
	});
}

beforeEach(() => {
	workers.length = 0;
	fetchCalls.length = 0;
	textureUploads.length = 0;
	vi.stubGlobal('Worker', MockWorker);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:splat-worker');
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			fetchCalls.push(String(input));
			const bytes = splatBytes();
			return new Response(bytes, { headers: { 'Content-Length': String(bytes.byteLength) } });
		}),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function mountPair(props: Record<string, unknown>) {
	let reactState!: RootState;
	let reactFirst!: TargetMesh;
	let reactSecond!: TargetMesh;
	let octaneFirst!: TargetMesh;
	let octaneSecond!: TargetMesh;
	function Capture() {
		reactState = useThree();
		return null;
	}
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 200, height: 100, left: 0, top: 0 },
	});
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactSplat, {
						...props,
						position: props.firstPosition,
						name: 'first-splat',
					}),
					props.second &&
						React.createElement(ReactSplat, {
							...props,
							alphaTest: props.secondAlphaTest,
							alphaHash: props.secondAlphaHash,
							toneMapped: props.secondToneMapped,
							chunkSize: props.secondChunkSize,
							position: props.secondPosition,
							name: 'second-splat',
						}),
				),
				React.createElement(Capture),
			),
		),
	);
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 200, height: 100, left: 0, top: 0 },
	});
	octaneRoot.render(SplatScene, {
		...props,
	});
	await flush(30);
	reactFirst = reactState.scene.getObjectByName('first-splat') as TargetMesh;
	reactSecond = reactState.scene.getObjectByName('second-splat') as TargetMesh;
	octaneFirst = octaneRoot.store.getState().scene.getObjectByName('first-splat') as TargetMesh;
	octaneSecond = octaneRoot.store.getState().scene.getObjectByName('second-splat') as TargetMesh;
	return {
		reactRoot,
		octaneRoot,
		get reactState() {
			return reactState;
		},
		get reactFirst() {
			return reactFirst;
		},
		get reactSecond() {
			return reactSecond;
		},
		get octaneFirst() {
			return octaneFirst;
		},
		get octaneSecond() {
			return octaneSecond;
		},
	};
}

async function advancePair(pair: Awaited<ReturnType<typeof mountPair>>, delta = 0.1) {
	await act(async () => reactAdvance(delta, true, pair.reactState));
	pair.octaneRoot.store.getState().advance(delta);
	await flush();
}

function snapshot(mesh: TargetMesh) {
	const geometry = mesh.geometry;
	const material = mesh.material;
	return {
		name: mesh.name,
		position: mesh.position.toArray(),
		frustumCulled: mesh.frustumCulled,
		ready: mesh.ready,
		sorted: mesh.sorted,
		instanceCount: geometry.instanceCount,
		positions: Array.from(geometry.attributes.position.array),
		splatIndexes: Array.from(geometry.attributes.splatIndex.array),
		splatUsage: (geometry.attributes.splatIndex as THREE.InstancedBufferAttribute).usage,
		material: {
			transparent: material.transparent,
			depthTest: material.depthTest,
			depthWrite: material.depthWrite,
			alphaTest: material.alphaTest,
			alphaHash: material.alphaHash,
			blending: material.blending,
			blendSrcAlpha: material.blendSrcAlpha,
			toneMapped: material.toneMapped,
			viewport: material.viewport?.toArray(),
			focal: material.focal,
			textures: [
				material.centerAndScaleTexture?.image.width,
				material.centerAndScaleTexture?.image.height,
				material.covAndColorTexture?.internalFormat,
			],
			shaderMarkers: [
				material.vertexShader.includes('splatIndex'),
				material.fragmentShader.includes('alphahash_fragment'),
			],
		},
	};
}

describe('Splat', () => {
	it('matches progressive loading, shared cache/state, geometry, sorting, cleanup, and non-hashed material behavior', async () => {
		const pair = await mountPair({
			src: '/scene.splat',
			second: true,
			alphaTest: 0.2,
			alphaHash: false,
			toneMapped: true,
			chunkSize: 1,
			firstPosition: [1, 2, 3],
			secondPosition: [-1, 0, 2],
			secondAlphaTest: 0.4,
			secondAlphaHash: false,
			secondToneMapped: false,
			secondChunkSize: 99,
		});
		expect(fetchCalls).toEqual(['/scene.splat', '/scene.splat']);
		expect(workers).toHaveLength(2);
		expect(pair.octaneFirst.material.centerAndScaleTexture).toBe(
			pair.octaneSecond.material.centerAndScaleTexture,
		);
		expect(pair.reactFirst.material.centerAndScaleTexture).toBe(
			pair.reactSecond.material.centerAndScaleTexture,
		);
		expect(textureUploads).toHaveLength(4);
		await advancePair(pair);
		expect(snapshot(pair.octaneFirst)).toEqual(snapshot(pair.reactFirst));
		expect(snapshot(pair.octaneSecond)).toEqual(snapshot(pair.reactSecond));
		expect(snapshot(pair.octaneFirst).instanceCount).toBe(2);
		expect(
			workers.every(
				(worker) => worker.messages.filter((message) => message.method === 'push').length === 1,
			),
		).toBe(true);
		expect(
			workers.every(
				(worker) => worker.messages.filter((message) => message.method === 'sort').length === 2,
			),
		).toBe(true);

		// Negative control: changing one material's blend mode must fail parity.
		pair.octaneFirst.material.blending = THREE.NormalBlending;
		expect(snapshot(pair.octaneFirst)).not.toEqual(snapshot(pair.reactFirst));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(workers.every((worker) => worker.listeners.size === 0)).toBe(true);
	});

	it('matches alphaHash defines/material state and sorted-worker short circuit', async () => {
		const pair = await mountPair({
			src: '/hashed.splat',
			alphaHash: true,
			alphaTest: 0.8,
			toneMapped: false,
			chunkSize: 25000,
			firstPosition: [0, 0, 0],
		});
		await advancePair(pair);
		expect(snapshot(pair.octaneFirst)).toEqual(snapshot(pair.reactFirst));
		expect(pair.octaneFirst.material.transparent).toBe(false);
		expect(pair.octaneFirst.material.depthWrite).toBe(true);
		expect(pair.octaneFirst.material.alphaTest).toBe(0);
		expect(pair.octaneFirst.material.alphaHash).toBe(true);
		const counts = workers.map(
			(worker) => worker.messages.filter((message) => message.method === 'sort').length,
		);
		await advancePair(pair);
		expect(
			workers.map(
				(worker) => worker.messages.filter((message) => message.method === 'sort').length,
			),
		).toEqual(counts);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});
});
