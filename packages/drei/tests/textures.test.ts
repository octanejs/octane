import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type ReconcilerRoot,
} from '@react-three/fiber';
import {
	IsObject as ReactIsObject,
	Texture as ReactTexture,
	useTexture as reactUseTexture,
} from '@react-three/drei/core/Texture.js';
import {
	CubeTexture as ReactCubeTexture,
	useCubeTexture as reactUseCubeTexture,
} from '@react-three/drei/core/CubeTexture.js';
import { Ktx2 as ReactKtx2, useKTX2 as reactUseKTX2 } from '@react-three/drei/core/Ktx2.js';
import { create as createOctaneThree, type ThreeTestRenderer } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { KTX2Loader } from 'three-stdlib';
import {
	CubeTexture as OctaneCubeTexture,
	IsObject,
	Ktx2 as OctaneKtx2,
	Texture as OctaneTexture,
	useCubeTexture,
	useKTX2,
	useTexture,
} from '../src/index.js';
import {
	CubeTextureBoundary,
	Ktx2Boundary,
	TextureBlockBoundary,
	TextureBoundary,
} from './_fixtures/textures.three.tsrx';

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;
const originalTextureLoad = THREE.TextureLoader.prototype.load;
const originalCubeLoad = THREE.CubeTextureLoader.prototype.load;
const originalKtxLoad = KTX2Loader.prototype.load;
const originalDetectSupport = KTX2Loader.prototype.detectSupport;
const originalSetTranscoderPath = KTX2Loader.prototype.setTranscoderPath;
const textureRequests: string[] = [];
const cubeRequests: Array<{ files: string[]; path: string }> = [];
const ktxRequests: Array<{ url: string; basisPath: string }> = [];
const ktxBasisPaths = new WeakMap<KTX2Loader, string>();

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.TextureLoader.prototype.load = function (url, onLoad) {
		textureRequests.push(url);
		const texture = new THREE.Texture();
		texture.name = url;
		onLoad?.(texture);
		return texture;
	};
	THREE.CubeTextureLoader.prototype.load = function (files, onLoad) {
		cubeRequests.push({ files: [...files], path: this.path });
		const texture = new THREE.CubeTexture();
		texture.name = `${this.path}${files.join('|')}`;
		onLoad?.(texture);
		return texture;
	};
	KTX2Loader.prototype.detectSupport = function () {
		return this;
	};
	KTX2Loader.prototype.setTranscoderPath = function (path) {
		ktxBasisPaths.set(this, path);
		return this;
	};
	KTX2Loader.prototype.load = function (url, onLoad) {
		const basisPath = ktxBasisPaths.get(this) ?? '';
		ktxRequests.push({ url, basisPath });
		const texture = new THREE.CompressedTexture();
		texture.name = `${basisPath}${url}`;
		onLoad?.(texture as never);
		return texture as never;
	};
});

afterAll(() => {
	THREE.TextureLoader.prototype.load = originalTextureLoad;
	THREE.CubeTextureLoader.prototype.load = originalCubeLoad;
	KTX2Loader.prototype.load = originalKtxLoad;
	KTX2Loader.prototype.detectSupport = originalDetectSupport;
	KTX2Loader.prototype.setTranscoderPath = originalSetTranscoderPath;
	if (previousActEnvironment === undefined)
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	else
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
});

function renderer(canvas: HTMLCanvasElement) {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
		initTexture: vi.fn(),
	} as unknown as THREE.WebGLRenderer;
}

function textureNames(value: unknown): unknown {
	if (value instanceof THREE.Texture) return value.name;
	if (Array.isArray(value)) return value.map(textureNames);
	if (IsObject(value))
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, textureNames(item)]),
		);
	return value;
}

async function flushLoads(): Promise<void> {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

async function reactRoot(): Promise<{
	root: ReconcilerRoot<HTMLCanvasElement>;
	gl: THREE.WebGLRenderer;
}> {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	const gl = renderer(canvas);
	await root.configure({
		gl,
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	return { root, gl };
}

describe('Texture and useTexture', () => {
	it('renders natural TSRX block children without invoking them as render props', async () => {
		const root = await createOctaneThree(TextureBlockBoundary, { input: '/block.png' });
		await flushLoads();
		expect(root.scene.getObjectByName('texture-block-child')).toBeDefined();
		root.unmount();
		useTexture.clear('/block.png');
	});

	it.each([
		['single', '/single.png'],
		['array', ['/a.png', '/b.png']],
		['record', { map: '/map.png', normalMap: '/normal.png' }],
	] as const)('matches the pinned React Drei oracle for %s input', async (_name, input) => {
		const reactValues: unknown[] = [];
		const reactLoads: unknown[] = [];
		const octaneValues: unknown[] = [];
		const octaneLoads: unknown[] = [];
		const react = await reactRoot();
		await reactThreeAct(async () =>
			react.root.render(
				React.createElement(
					React.Suspense,
					{ fallback: React.createElement('group', { name: 'loading' }) },
					React.createElement(
						ReactTexture,
						{ input, onLoad: (value) => reactLoads.push(textureNames(value)) },
						(value) => {
							reactValues.push(textureNames(value));
							return null;
						},
					),
				),
			),
		);
		const octane = await createOctaneThree(TextureBoundary, {
			input,
			onLoad: (value: unknown) => octaneLoads.push(textureNames(value)),
			children: (value: unknown) => {
				octaneValues.push(textureNames(value));
				return null;
			},
		});
		await flushLoads();

		expect(octaneValues.at(-1)).toEqual(reactValues.at(-1));
		expect(octaneLoads.at(-1)).toEqual(reactLoads.at(-1));

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		const urls = IsObject(input) ? Object.values(input) : input;
		useTexture.clear(urls as string | string[]);
		reactUseTexture.clear(urls as string | string[]);
	});

	it('matches IsObject and static cache API behavior', () => {
		for (const value of [null, undefined, 'url', ['/a'], { map: '/a' }, () => '/a']) {
			expect(IsObject(value)).toBe(ReactIsObject(value));
		}
		expect(typeof useTexture.preload).toBe(typeof reactUseTexture.preload);
		expect(typeof useTexture.clear).toBe(typeof reactUseTexture.clear);
		expect(typeof OctaneTexture).toBe('function');
	});
});

describe('CubeTexture and useCubeTexture', () => {
	it('matches files, path configuration, render prop, preload, and cache clearing', async () => {
		const files = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
		const path = '/cube/';
		const reactValues: unknown[] = [];
		const octaneValues: unknown[] = [];
		const react = await reactRoot();
		await reactThreeAct(async () =>
			react.root.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactCubeTexture, { files, path }, (value) => {
						reactValues.push(textureNames(value));
						return null;
					}),
				),
			),
		);
		const octane: ThreeTestRenderer = await createOctaneThree(CubeTextureBoundary, {
			files,
			path,
			children: (value: unknown) => {
				octaneValues.push(textureNames(value));
				return null;
			},
		});
		await flushLoads();

		expect(octaneValues.at(-1)).toEqual(reactValues.at(-1));
		expect(cubeRequests.filter((request) => request.path === path)).toHaveLength(2);
		expect(typeof useCubeTexture.preload).toBe(typeof reactUseCubeTexture.preload);
		expect(typeof OctaneCubeTexture).toBe('function');

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});

describe('Ktx2 and useKTX2', () => {
	it.each([
		['single', '/single.ktx2'],
		['array', ['/a.ktx2', '/b.ktx2']],
		['record', { map: '/map.ktx2', normalMap: '/normal.ktx2' }],
	] as const)('matches the pinned React Drei oracle for %s input', async (_name, input) => {
		const basisPath = '/basis/';
		const reactValues: unknown[] = [];
		const octaneValues: unknown[] = [];
		const react = await reactRoot();
		await reactThreeAct(async () =>
			react.root.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactKtx2, { input, basisPath }, (value) => {
						reactValues.push(textureNames(value));
						return null;
					}),
				),
			),
		);
		const octane = await createOctaneThree(Ktx2Boundary, {
			input,
			basisPath,
			children: (value: unknown) => {
				octaneValues.push(textureNames(value));
				return null;
			},
		});
		await flushLoads();

		expect(octaneValues.at(-1)).toEqual(reactValues.at(-1));
		expect(ktxRequests.some((request) => request.basisPath === basisPath)).toBe(true);
		expect(typeof useKTX2.preload).toBe(typeof reactUseKTX2.preload);
		expect(typeof useKTX2.clear).toBe(typeof reactUseKTX2.clear);
		expect(typeof OctaneKtx2).toBe('function');

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		const urls = IsObject(input) ? Object.values(input) : input;
		useKTX2.clear(urls as string | string[]);
		reactUseKTX2.clear(urls as string | string[]);
	});
});
