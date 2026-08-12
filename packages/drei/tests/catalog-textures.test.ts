import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import {
	GradientTexture as ReactGradientTexture,
	GradientType as ReactGradientType,
} from '@react-three/drei/core/GradientTexture.js';
import { MatcapTexture as ReactMatcapTexture } from '@react-three/drei/core/MatcapTexture.js';
import { NormalTexture as ReactNormalTexture } from '@react-three/drei/core/NormalTexture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GradientType } from '../src/index.js';
import {
	GradientScene,
	MatcapBoundary,
	NormalBoundary,
} from './_fixtures/catalog-textures.three.tsrx';

const originalLoad = THREE.TextureLoader.prototype.load;
const originalContext = HTMLCanvasElement.prototype.getContext;
const requests: string[] = [];

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.TextureLoader.prototype.load = function (url, onLoad) {
		requests.push(url);
		const texture = new THREE.Texture();
		texture.name = url;
		onLoad?.(texture);
		return texture;
	};
});

afterAll(() => {
	THREE.TextureLoader.prototype.load = originalLoad;
	HTMLCanvasElement.prototype.getContext = originalContext;
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
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
		initTexture() {},
	} as unknown as THREE.WebGLRenderer;
}

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	await reactThreeAct(async () =>
		root.render(React.createElement(React.Suspense, { fallback: null }, element)),
	);
	return root;
}

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 10; index++) await Promise.resolve();
	});
}

describe('catalog textures', () => {
	it('matches MatcapTexture list selection, format suffix, total, loading, and child tuple', async () => {
		const fetchMock = vi.fn(async (url: string) => ({
			json: async () => (url.includes('matcaps') ? { 0: 'DEFAULT', 1: 'SECOND', 2: 'THIRD' } : {}),
		}));
		vi.stubGlobal('fetch', fetchMock);
		let reactValue: [THREE.Texture, string, number] | undefined;
		const react = await reactRoot(
			React.createElement(ReactMatcapTexture, {
				id: 1,
				format: 256,
				children: (value) => {
					reactValue = value;
					return null;
				},
			}),
		);
		let octaneValue: [THREE.Texture, string, number] | undefined;
		const octane = await createOctaneThree(MatcapBoundary, {
			id: 1,
			format: 256,
			onLoad: undefined,
			children: (value: [THREE.Texture, string, number]) => {
				octaneValue = value;
				return null;
			},
		});
		await flush();
		const snapshot = (value: [THREE.Texture, string, number]) => ({
			name: value[0].name,
			url: value[1],
			total: value[2],
		});
		expect(snapshot(octaneValue!)).toEqual(snapshot(reactValue!));
		expect(octaneValue![1]).toContain('/256/SECOND-256px.png');
		expect(fetchMock).toHaveBeenCalled();
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
		vi.unstubAllGlobals();
	});

	it('matches NormalTexture URL fallback and texture mutations', async () => {
		const fetchMock = vi.fn(async () => ({
			json: async () => ({ 0: 'default.png', 1: 'one.png' }),
		}));
		vi.stubGlobal('fetch', fetchMock);
		let reactValue: [THREE.Texture, string, number] | undefined;
		const react = await reactRoot(
			React.createElement(ReactNormalTexture, {
				id: 99,
				repeat: [2, 3],
				offset: [0.25, 0.5],
				anisotropy: 8,
				children: (value) => {
					reactValue = value;
					return null;
				},
			}),
		);
		let octaneValue: [THREE.Texture, string, number] | undefined;
		const octane = await createOctaneThree(NormalBoundary, {
			id: 99,
			repeat: [2, 3],
			offset: [0.25, 0.5],
			anisotropy: 8,
			onLoad: undefined,
			children: (value: [THREE.Texture, string, number]) => {
				octaneValue = value;
				return null;
			},
		});
		await flush();
		const snapshot = (value: [THREE.Texture, string, number]) => ({
			url: value[1],
			total: value[2],
			wrapS: value[0].wrapS,
			wrapT: value[0].wrapT,
			repeat: value[0].repeat.toArray(),
			offset: value[0].offset.toArray(),
			anisotropy: value[0].anisotropy,
		});
		expect(snapshot(octaneValue!)).toEqual(snapshot(reactValue!));
		expect(octaneValue![1]).toContain('/normals/default.png');
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
		vi.unstubAllGlobals();
	});

	it.each([
		['linear', ReactGradientType.Linear, GradientType.Linear],
		['radial', ReactGradientType.Radial, GradientType.Radial],
	] as const)(
		'matches %s GradientTexture canvas operations and texture attachment',
		async (_name, reactType, octaneType) => {
			const operations: unknown[][] = [];
			HTMLCanvasElement.prototype.getContext = function () {
				const gradient = {
					addColorStop: (...args: unknown[]) => operations.push(['stop', ...args]),
				};
				return {
					createLinearGradient: (...args: unknown[]) => {
						operations.push(['linear', ...args]);
						return gradient;
					},
					createRadialGradient: (...args: unknown[]) => {
						operations.push(['radial', ...args]);
						return gradient;
					},
					save: () => operations.push(['save']),
					restore: () => operations.push(['restore']),
					fillRect: (...args: unknown[]) => operations.push(['fillRect', ...args]),
					set fillStyle(_value: unknown) {
						operations.push(['fillStyle']);
					},
				} as unknown as CanvasRenderingContext2D;
			} as typeof HTMLCanvasElement.prototype.getContext;
			let reactTexture: THREE.CanvasTexture | null = null;
			const reactStart = operations.length;
			const react = await reactRoot(
				React.createElement(ReactGradientTexture, {
					stops: [0, 0.5, 1],
					colors: ['red', 'green', 'blue'],
					size: 32,
					width: 8,
					type: reactType,
					innerCircleRadius: -2,
					outerCircleRadius: 10,
					ref: (value: THREE.CanvasTexture | null) => (reactTexture = value),
				}),
			);
			const reactOperations = operations.slice(reactStart);
			let octaneTexture: THREE.CanvasTexture | null = null;
			const octaneStart = operations.length;
			const octane = await createOctaneThree(GradientScene, {
				stops: [0, 0.5, 1],
				colors: ['red', 'green', 'blue'],
				size: 32,
				width: 8,
				type: octaneType,
				innerCircleRadius: -2,
				outerCircleRadius: 10,
				textureRef: (value: THREE.CanvasTexture | null) => (octaneTexture = value),
			});
			const octaneOperations = operations.slice(octaneStart);
			expect(octaneOperations).toEqual(reactOperations);
			expect({
				width: (octaneTexture!.image as HTMLCanvasElement).width,
				height: (octaneTexture!.image as HTMLCanvasElement).height,
				colorSpace: octaneTexture!.colorSpace,
			}).toEqual({
				width: (reactTexture!.image as HTMLCanvasElement).width,
				height: (reactTexture!.image as HTMLCanvasElement).height,
				colorSpace: reactTexture!.colorSpace,
			});
			octane.unmount();
			await reactThreeAct(async () => react.unmount());
		},
	);
});
