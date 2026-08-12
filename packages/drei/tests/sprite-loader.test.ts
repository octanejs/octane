import * as React from 'react';
import { act, createRoot as createReactRoot } from '@react-three/fiber';
import { useSpriteLoader as reactUseSpriteLoader } from '@react-three/drei/core/useSpriteLoader.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useSpriteLoader, type FrameData, type SpriteData } from '../src/index.js';
import { SpriteLoaderScene } from './_fixtures/sprite-loader.three.tsrx';

type LoaderResult = ReturnType<typeof useSpriteLoader>;
type LoadRecord = { texture: THREE.Texture; data: SpriteData | null };

const textures = new Map<string, THREE.Texture>();
const jsonByUrl = new Map<string, SpriteData>();
const textureLoadCalls: string[] = [];

function frame(
	filename: string,
	x: number,
	width: number,
	height: number,
): FrameData & { filename: string } {
	return {
		filename,
		frame: { x, y: 0, w: width, h: height },
		rotated: false,
		trimmed: false,
		spriteSourceSize: { x: 0, y: 0, w: width, h: height },
		sourceSize: { w: width, h: height },
	};
}

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
	} as unknown as THREE.WebGLRenderer;
}

async function flush(): Promise<void> {
	await act(async () => {
		for (let index = 0; index < 12; index++) await Promise.resolve();
	});
}

function snapshot(result: LoaderResult | undefined) {
	const value = result?.spriteObj;
	return (
		value && {
			aspect: value.aspect.toArray(),
			colorSpace: value.spriteTexture.colorSpace,
			frames: value.spriteData?.frames,
			meta: value.spriteData?.meta,
			image: value.spriteTexture.image && [
				value.spriteTexture.image.width,
				value.spriteTexture.image.height,
			],
		}
	);
}

async function mountPair(options: {
	input: string | null;
	json?: string | null;
	animationNames?: string[] | null;
	numberOfFrames?: number | null;
}) {
	let reactResult: ReturnType<typeof reactUseSpriteLoader> | undefined;
	let octaneResult: LoaderResult | undefined;
	const reactLoads: LoadRecord[] = [];
	const octaneLoads: LoadRecord[] = [];
	const contextSettings = { willReadFrequently: true } as const;
	const onReactLoad = (texture: THREE.Texture, data?: SpriteData | null) =>
		reactLoads.push({ texture, data: data ?? null });
	function ReactScene() {
		reactResult = reactUseSpriteLoader(
			options.input,
			options.json,
			options.animationNames,
			options.numberOfFrames,
			onReactLoad,
			contextSettings,
		);
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
	await act(async () => reactRoot.render(React.createElement(ReactScene)));
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 200, height: 100, left: 0, top: 0 },
	});
	octaneRoot.render(SpriteLoaderScene, {
		...options,
		contextSettings,
		onLoad: (texture: THREE.Texture, data?: SpriteData | null) =>
			octaneLoads.push({ texture, data: data ?? null }),
		onRender: (value: LoaderResult) => {
			octaneResult = value;
		},
	});
	await flush();
	return {
		reactRoot,
		octaneRoot,
		get reactResult() {
			return reactResult;
		},
		get octaneResult() {
			return octaneResult;
		},
		reactLoads,
		octaneLoads,
	};
}

beforeEach(() => {
	textures.clear();
	jsonByUrl.clear();
	textureLoadCalls.length = 0;
	vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (url, onLoad) {
		textureLoadCalls.push(String(url));
		const texture = new THREE.Texture({ width: 64, height: 32 });
		texture.name = String(url);
		textures.set(String(url), texture);
		queueMicrotask(() => onLoad?.(texture));
		return texture;
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL | Request) => ({
			json: async () => structuredClone(jsonByUrl.get(String(url))),
		})),
	);
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
		contextId: string,
	) {
		if (contextId !== '2d') return null;
		return {
			drawImage() {},
			getImageData(x: number, y: number) {
				// The lower-right cell is transparent; all other cells have one opaque pixel.
				return { data: new Uint8ClampedArray([0, 0, 0, x >= 32 && y >= 16 ? 0 : 255]) };
			},
		} as unknown as CanvasRenderingContext2D;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('useSpriteLoader', () => {
	it('matches JSON loading, animation grouping, scale ratios, callback state, and the real renderer chain', async () => {
		const data = {
			frames: [frame('idle-0', 0, 32, 16), frame('idle-1', 32, 16, 8), frame('run-0', 48, 8, 8)],
			meta: {
				version: '1',
				size: { w: 64, h: 32 },
				rows: 1,
				columns: 3,
				frameWidth: 16,
				frameHeight: 16,
				scale: '1',
			},
		} as unknown as SpriteData;
		jsonByUrl.set('/sheet.json', data);
		const pair = await mountPair({
			input: '/sheet.png',
			json: '/sheet.json',
			animationNames: ['idle', 'run'],
		});

		expect(snapshot(pair.octaneResult)).toEqual(snapshot(pair.reactResult as LoaderResult));
		expect(pair.octaneLoads.map(({ data: value }) => value)).toEqual(
			pair.reactLoads.map(({ data: value }) => value),
		);
		expect(
			(pair.octaneResult!.spriteObj!.spriteData!.frames as Record<string, FrameData[]>).idle.map(
				(value) => value.scaleRatio,
			),
		).toEqual([1, 0.5]);
		expect(pair.octaneResult!.spriteObj!.spriteTexture.name).toBe('/sheet.png');

		// Negative control: a changed delimiter must not accidentally satisfy parity.
		const changed = structuredClone(snapshot(pair.octaneResult));
		(changed!.frames as Record<string, FrameData[]>).idle = [];
		expect(changed).not.toEqual(snapshot(pair.reactResult as LoaderResult));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches standalone grid parsing, transparent-frame exclusion, and metadata boundaries', async () => {
		const pair = await mountPair({ input: '/standalone.png', numberOfFrames: 6 });
		expect(snapshot(pair.octaneResult)).toEqual(snapshot(pair.reactResult as LoaderResult));
		const data = pair.octaneResult!.spriteObj!.spriteData!;
		expect(data.meta).toMatchObject({ rows: 2, columns: 3, frameWidth: 64 / 3, frameHeight: 16 });
		expect(data.frames as FrameData[]).toHaveLength(5);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches imperative fallback loading, missing-input errors, preload, and clear surface', async () => {
		const pair = await mountPair({ input: null });
		pair.reactResult!.loadJsonAndTexture('/react-manual.png');
		pair.octaneResult!.loadJsonAndTexture('/octane-manual.png');
		await flush();
		expect(snapshot(pair.octaneResult)).toEqual(snapshot(pair.reactResult as LoaderResult));
		expect(() => pair.reactResult!.loadJsonAndTexture('')).toThrow(
			'Either textureUrl or input must be provided',
		);
		expect(() => pair.octaneResult!.loadJsonAndTexture('')).toThrow(
			'Either textureUrl or input must be provided',
		);
		expect(typeof useSpriteLoader.preload).toBe(typeof reactUseSpriteLoader.preload);
		expect(typeof useSpriteLoader.clear).toBe(typeof reactUseSpriteLoader.clear);
		useSpriteLoader.preload('/octane-preload.png');
		useSpriteLoader.preload('/octane-preload.png');
		reactUseSpriteLoader.preload('/react-preload.png');
		reactUseSpriteLoader.preload('/react-preload.png');
		await flush();
		expect(textureLoadCalls.filter((url) => url === '/octane-preload.png')).toHaveLength(1);
		expect(textureLoadCalls.filter((url) => url === '/react-preload.png')).toHaveLength(1);
		useSpriteLoader.clear('/octane-preload.png');
		reactUseSpriteLoader.clear('/react-preload.png');
		useSpriteLoader.preload('/octane-preload.png');
		reactUseSpriteLoader.preload('/react-preload.png');
		await flush();
		expect(textureLoadCalls.filter((url) => url === '/octane-preload.png')).toHaveLength(2);
		expect(textureLoadCalls.filter((url) => url === '/react-preload.png')).toHaveLength(2);
		useSpriteLoader.clear('/octane-preload.png');
		reactUseSpriteLoader.clear('/react-preload.png');
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});
});
